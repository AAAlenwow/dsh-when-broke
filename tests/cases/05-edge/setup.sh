#!/usr/bin/env bash
# Edge case: a directory that is NOT a git repo.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf not-a-repo
mkdir -p not-a-repo
cd not-a-repo
cat > hello.txt <<'HELLO'
hello
HELLO
echo "Created not-a-repo/ (no git init)"
