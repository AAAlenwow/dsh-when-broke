# dsh-when-broke

> "It worked yesterday, who broke it?" — answer in 4 tools.

A DSH plugin that turns "the build broke and I don't know when" into a
3-line answer. Lives in the dsh-ai-armor bundle (production-problem
plugins for everyday dev pain).

## The 4 tools

| Tool | What it answers | Example call |
|---|---|---|
| `find_introducer` | "Where did this string of code first appear?" — pickaxe search for the commit that introduced/removed a literal | `find_introducer({ file: "src/auth.js", pickaxe: "jwt.verify(" })` |
| `bisect_with_repro` | "Which commit broke this?" — automated `git bisect run` with a user-supplied repro command | `bisect_with_repro({ good: "v1.2.0", bad: "HEAD", repro: "npm test" })` |
| `recent_changes` | "What touched this file recently, ranked by risk?" — last N commits to a file with adds/dels/age/risk-score | `recent_changes({ file: "src/auth.js", daysBack: 30 })` |
| `blame_age` | "Who last touched this line, and how long ago?" — `git blame` + age calculation | `blame_age({ file: "src/auth.js", line: 47 })` |

## Why these 4?

- **find_introducer** answers "where did this code come from?" — the most
  common question when reading unfamiliar code. Pickaxe (`-S`) is more
  accurate than line-range (`-L`) because it tracks the literal string,
  not the line number (which shifts as the file grows).
- **bisect_with_repro** is the classic "git bisect" but scripted. Uses
  `git bisect run` under the hood so the agent doesn't have to manage
  checkout state.
- **recent_changes** ranks by *risk*, not just time — so the agent
  surfaces "this 1-line refactor" or "this commit message has 'fix' in
  it" before "this 200-line feature".
- **blame_age** answers "is this line the bug?" — old lines are usually
  not the culprit.

## Measured performance (test fixtures, see REPORT.md)

| Tool | Latency | Output size |
|---|---|---|
| `find_introducer` | ~15ms | ~700 chars / ~220 tokens |
| `bisect_with_repro` | ~330ms (4-step bisect) | ~650 chars / ~200 tokens |
| `recent_changes` | ~10ms | ~1300 chars / ~400 tokens |
| `blame_age` | ~13ms | ~450 chars / ~140 tokens |

All measurements on darwin/arm64, Node 24.17.0, real git operations
against a 6-commit fixture repo.

## What's NOT in scope

- No cross-repo / cross-fork search. Each tool works on the local cwd.
- No online issue-tracker integration (e.g. "link this commit to its
  GitHub issue"). This is a local-codebase tool.
- No automated fix generation. The tools *locate*; the agent still
  *fixes*.

## Install

This plugin is part of the `dsh-ai-armor` bundle — see the bundle
README for the one-line install.

## Install (standalone)

```sh
git clone https://github.com/AAAlenwow/dsh-when-broke.git
dsh plugin --profile web add ./dsh-when-broke
```

> Part of the [dsh-ai-armor](https://github.com/AAAlenwow/dsh-ai-armor) 5-tool bundle.
> Pick one, not both: the bundle already registers this tool set (tool ids would collide).
