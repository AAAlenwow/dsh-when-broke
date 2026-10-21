#!/usr/bin/env bash
# Shared fixture builder for dsh-when-broke test cases.
#
# Usage:  build-sample-repo.sh <target-dir>
#
# Builds a deterministic sample-app git repo inside <target-dir> with a
# known bug history. SHAs are stable because we set GIT_AUTHOR_DATE /
# GIT_COMMITTER_DATE to a fixed instant.
#
# Commit chain (oldest → newest):
#   dcd6911 initial: project skeleton
#   ef2a810 feat: basic calculator with add/subtract
#   73ec6cf feat: add divide with zero check (uses ===)  + adds test/divide.test.js
#   b42220d refactor: divide returns (a - b) instead of (a / b)   ← BUG
#   5c692d6 feat: add multiply (rewrites whole file, so blame of any
#                 line in src/calculator.js points HERE, not at b42220d)
#   047fb19 docs: add usage example to README
#
# Why test/divide.test.js is added at 73ec6cf (the GOOD commit), not later:
# `git bisect` needs the test file to exist at both the good and bad
# commits — otherwise the repro fails with MODULE_NOT_FOUND instead of
# a real test failure, and the bisect never converges.
#
# Why the bug is (a - b) instead of (a / b), and not the more realistic
# ==/=== coercion bug: with the coercion bug, the test would have to assert
# on string-coercion edge cases ('0' == 0 is true in JS), which makes the
# test's good/bad semantics ambiguous. (a - b) gives an unambiguous
# numerical assertion that the bisect can converge on.

set -euo pipefail

TARGET="${1:?Usage: build-sample-repo.sh <target-dir>}"

# Wipe & rebuild to keep SHAs stable across re-runs.
rm -rf "$TARGET"
mkdir -p "$TARGET/src" "$TARGET/test"
cd "$TARGET"
git init -q -b main
git config user.name "test-bot"
git config user.email "bot@test.local"
export GIT_AUTHOR_DATE="2024-01-01T00:00:00+00:00"
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"

commit() {
  git add -A
  GIT_AUTHOR_DATE="$GIT_AUTHOR_DATE" GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE" \
    git commit -q -m "$1"
}

# 1. dcd6911 initial
cat > README.md <<'EOF'
# sample-app
Tiny Node.js calculator. Used as a fixture for dsh-when-broke.
EOF
commit "initial: project skeleton"

# 2. ef2a810 feat: basic calculator with add/subtract
cat > src/calculator.js <<'EOF'
// src/calculator.js — test fixture for dsh-when-broke
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = { add, subtract };
EOF
commit "feat: basic calculator with add/subtract"

# 3. 73ec6cf feat: add divide with zero check (uses ===) + add test file
cat > src/calculator.js <<'EOF'
// src/calculator.js — test fixture for dsh-when-broke
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

module.exports = { add, subtract, divide };
EOF

# Add the test file at the SAME commit so the test exists at every commit
# from here on — this is what makes `git bisect run` converge.
cat > test/divide.test.js <<'EOF'
// test/divide.test.js — divide(10, 2) must equal 5 (not 8 = 10 - 2)
const { divide } = require('../src/calculator.js');
const got = divide(10, 2);
if (got === 5) {
  console.log('OK');
  process.exit(0);
} else {
  console.error('FAIL: divide(10, 2) === 5 expected, got', got);
  process.exit(1);
}
EOF
commit "feat: add divide with zero check (uses ===)"

# 4. b42220d refactor: divide returns (a - b) instead of (a / b)  ← BUG
sed -i.bak 's|return a / b;|return a - b;|' src/calculator.js
rm -f src/calculator.js.bak
commit "refactor: divide returns (a - b) instead of (a / b)"

# 5. 5c692d6 feat: add multiply (also rewrites whole file so blame of any
#    line in src/calculator.js at HEAD points here, not at b42220d)
cat > src/calculator.js <<'EOF'
// src/calculator.js — test fixture for dsh-when-broke
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function divide(a, b) {
  if (b === 0) {  // BUG INTRODUCED earlier: divide returns a - b, not a / b
    throw new Error('Division by zero');
  }
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = { add, subtract, divide, multiply };
EOF
commit "feat: add multiply"

# 6. 047fb19 docs: add usage example to README (does NOT touch src/ or test/)
cat > README.md <<'EOF'
# sample-app
Tiny Node.js calculator. Used as a fixture for dsh-when-broke.

## Usage
```js
const { add, divide } = require('./src/calculator.js');
add(1, 2);       // 3
divide(10, 2);   // 5
```
EOF
commit "docs: add usage example to README"

echo "Built $TARGET with $(git rev-list --count HEAD) commits"
git log --oneline
