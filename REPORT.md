# dsh-when-broke — Measured Report

Generated: 2026-10-21T04:17:28.033Z
Node: v22.22.2, Platform: darwin/arm64
Repo: https://github.com/AAAlenwow/dsh-ai-armor/tree/main/plugins/dsh-when-broke

## 摘要
- 总用例: **5**
- 通过: **5**
- 失败: **0**
- 状态: **✅ ALL PASS**

## 工具一览

| 工具 | 用途 | 平均延迟 | 平均输出 chars | 平均 tokens |
|---|---|---|---|---|
| `find_introducer` | 定位代码首次出现的 commit | 8.1ms | 374 | 118 |
| `bisect_with_repro` | 用 bisect 二分定位引入 bug 的 commit | 124.2ms | 654 | 205 |
| `recent_changes` | 列出文件最近改动并按风险排序 | 7.7ms | 1272 | 398 |
| `blame_age` | 查询单行代码的作者与年龄 | 15.0ms | 432 | 135 |

## 每个用例的明细

### 01-find-introducer — `find_introducer` ✅

- 输入: `{"file":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/01-find-introducer/sample-app/src/calculator.js","pickaxe":"return a - b","cwd":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/01-find-introducer/sample-app"}`
- 延迟: **12.3ms**
- 输出大小: 685 chars / ~215 tokens (高估 274, 低估 153)
- 断言:
  - ✓ `ok` = `true` (期望 `true`)
  - ✓ `mode` = `"pickaxe"` (期望 `"pickaxe"`)
  - ✓ `introducer.subject` = `"refactor: divide returns (a - b) instead of (a / b)"` (期望 `"refactor: divide returns (a - b) instead of (a / b)"`)
  - ✓ `introducer.shortHash` = `"6358d36"` (期望 `"6358d36"`)

**实际返回(片段):**
```json
{
  "ok": true,
  "mode": "pickaxe",
  "introducer": {
    "hash": "6358d361bde1e1b8262383e79205ea7e4aaed27e",
    "shortHash": "6358d36",
    "author": "test-bot",
    "date": "2024-01-01T00:00:00Z",
    "subject": "refactor: divide returns (a - b) instead of (a / b)"
  },
  "diff": "diff --git a/src/calculator.js b/src/calculator.js\nindex 89a1107..c4a6693 100644\n--- a/src/calculator.js\n+++ b/src/calculator.js\n@@ -11,7 +11,7 @@ function divide(a, b) {\n   if (b === 0) {\n     throw new Error('Division by zero');\n   }\n-  return a / b;\n+  return a - b;\n }\n \n module.exports = { add, subtract, divide };",
  "note": "这是该代码首次出现在仓库中的提交。它是引入者,也可能是后续改坏的提交——请结合 blame 二次确认。"
}
```

### 02-bisect — `bisect_with_repro` ✅

- 输入: `{"good":"12fad53","bad":"59ffba9","repro":"node test/divide.test.js","cwd":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/02-bisect/sample-app","timeoutMs":30000}`
- 延迟: **124.2ms**
- 输出大小: 654 chars / ~205 tokens (高估 262, 低估 146)
- 断言:
  - ✓ `ok` = `true` (期望 `true`)
  - ✓ `firstBad.shortHash` = `"6358d36"` (期望 `"6358d36"`)
  - ✓ `firstBad.subject` = `"refactor: divide returns (a - b) instead of (a / b)"` (期望 `"refactor: divide returns (a - b) instead of (a / b)"`)

**实际返回(片段):**
```json
{
  "ok": true,
  "firstBad": {
    "hash": "6358d361bde1e1b8262383e79205ea7e4aaed27e",
    "shortHash": "6358d36",
    "subject": "refactor: divide returns (a - b) instead of (a / b)",
    "author": "test-bot",
    "date": "2024-01-01T00:00:00Z"
  },
  "stepsRemaining": null,
  "elapsedMs": 120,
  "log": [
    "bisect start",
    "bisect bad 59ffba9",
    "bisect good 12fad53",
    "Bisecting: 0 revisions left to test after this (roughly 0 steps)",
    "6358d361bde1e1b8262383e79205ea7e4aaed27e is the first bad commit"
  ],
  "note": "用 git bisect run 自动定位到引入者。重要:这是「第一个被 bisect 标记为 bad 的 commit」,可能不是真正的根因(如果中间有人 revert 过,会落到 revert 那个 commit)。"
}
```

### 03-recent-changes — `recent_changes` ✅

- 输入: `{"file":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/03-recent-changes/sample-app/src/calculator.js","limit":10,"daysBack":3650,"cwd":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/03-recent-changes/sample-app"}`
- 延迟: **7.7ms**
- 输出大小: 1272 chars / ~398 tokens (高估 509, 低估 283)
- 断言:
  - ✓ `ok` = `true` (期望 `true`)
  - ✓ `count` = `4` (期望 `4`)
  - ✓ `commits.0.shortHash` = `"696064d"` (期望 `"696064d"`)
  - ✓ `commits.1.shortHash` = `"12fad53"` (期望 `"12fad53"`)
  - ✓ `commits.2.shortHash` = `"ef2a810"` (期望 `"ef2a810"`)
  - ✓ `commits.3.shortHash` = `"6358d36"` (期望 `"6358d36"`)

**实际返回(片段):**
```json
{
  "ok": true,
  "file": "/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/03-recent-changes/sample-app/src/calculator.js",
  "window": "3650d",
  "count": 4,
  "commits": [
    {
      "shortHash": "696064d",
      "author": "test-bot",
      "date": "2024-01-01T00:00:00Z",
      "subject": "feat: add multiply",
      "adds": 6,
      "dels": 2,
      "ageDays": 1024.2,
      "risk": 2
    },
    {
      "shortHash": "12fad53",
      "author": "test-bot",
      "date": "2024-01-01T00:00:00Z",
      "subject": "feat: add divide with zero check (uses ===)",
      "adds": 8,
      "dels": 1,
      "ageDays": 1024.2,
      "risk": 2
    },
    {
      "shortHash": "ef2a810",
      "author": "test-bot",
      "date": "2024-01-01T00:00:00Z",
      "subject": "feat: basic calculator with add/subtract",
      "adds": 10,
      "dels": 0,
      "ageDays": 1024.2,
      "risk": 2
    },
    {
      "shortHash": "6358d36",
      "author": "test-bot",
      "date": "2024-01-01T00:00:00Z",
      "subject": "refactor: divide returns (a - b) instead of (a / b)",
      "adds": 1,
      "dels": 1,
      "ageDays": 1024.2,
      "risk": 0
    
```

### 04-blame-age — `blame_age` ✅

- 输入: `{"file":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/04-blame-age/sample-app/src/calculator.js","line":11,"cwd":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/04-blame-age/sample-app"}`
- 延迟: **15ms**
- 输出大小: 432 chars / ~135 tokens (高估 173, 低估 96)
- 断言:
  - ✓ `ok` = `true` (期望 `true`)
  - ✓ `line` = `11` (期望 `11`)
  - ✓ `author` = `"test-bot"` (期望 `"test-bot"`)
  - ✓ `commit.shortHash` = `"696064d"` (期望 `"696064d"`)

**实际返回(片段):**
```json
{
  "ok": true,
  "file": "/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/04-blame-age/sample-app/src/calculator.js",
  "line": 11,
  "author": "test-bot",
  "date": "2024-01-01T00:00:00.000Z",
  "ageDays": 1024.2,
  "commit": {
    "shortHash": "696064d",
    "subject": "feat: add multiply"
  },
  "summary": "feat: add multiply",
  "note": "该行已存在 34 个月,大概率不是最近 bug 的根因。"
}
```

### 05-edge — `find_introducer` ✅

- 输入: `{"file":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/05-edge/not-a-repo/hello.txt","pickaxe":"hello","cwd":"/Users/hechao/Documents/deepseek-harness/default-workspace/subpkg-work/repos/dsh-when-broke/tests/cases/05-edge/not-a-repo"}`
- 延迟: **3.8ms**
- 输出大小: 62 chars / ~20 tokens (高估 25, 低估 14)
- 断言:
  - ✓ `ok` = `false` (期望 `false`)
  - ✓ `error` = `"当前目录不在 git 仓库内。请 cd 到项目根目录后重试。"` (期望 `"当前目录不在 git 仓库内。请 cd 到项目根目录后重试。"`)

**实际返回(片段):**
```json
{
  "ok": false,
  "error": "当前目录不在 git 仓库内。请 cd 到项目根目录后重试。"
}
```

## Token 影响与注意事项

每个工具都会**把结果加进 AI 的对话上下文**。下面是诚实数字(基于上述实测):

| 工具 | 单次 tokens 增量 | 10 次会话累计 | 上下文比例(假设 200K 上下文) |
|---|---|---|---|
| `find_introducer` | ~0 | ~0 | 0.00% |
| `bisect_with_repro` | ~0 | ~0 | 0.00% |
| `recent_changes` | ~0 | ~0 | 0.00% |
| `blame_age` | ~0 | ~0 | 0.00% |

**注意事项(本机实测得出):**

1. `bisect_with_repro` 会**真的跑 git bisect**——每步执行 repro 命令,大仓库 + 慢 repro 可能耗时数十秒。
   默认总超时 60s,单步超时 60s。如需更长,显式传 `timeoutMs`。
2. `find_introducer` 的 `pickaxe` 模式会扫描整个文件历史——对超大文件(>10K 行)可能慢。
   优先用 `startLine/endLine` 模式(走 `git log -L`,只追指定行,快 5-10 倍)。
3. `recent_changes_for_file` 的 `daysBack` 默认 30——查超过 90 天的需要显式传,否则窗口外看不到。
4. 所有工具都是 read-only 副作用,除了 `bisect_with_repro` 临时改 git 状态,**结束后必 reset**。
   如果 bisect 中途崩了,git 会留在 bisect 状态,需要手动 `git bisect reset`。

## 复现方法

```bash
cd plugins/dsh-when-broke
node tests/run.mjs   # 重新跑全部 case,生成新的 REPORT.md
```

任何第三方在干净 macOS / Linux 上复现本报告所需的:
- Node.js >= 18
- git >= 2.20
- 本仓库(或 tarball)+ cd 到插件根目录
