/**
 * find_introducer — given a file (and optional line range), find the commit
 * that introduced the current content of those lines. Two strategies:
 *
 *   1. With a line range, use `git log -L <range>:<file>` and parse out
 *      the FIRST commit whose diff hunk actually touches the requested
 *      line range. (Without filtering, the first commit in --reverse order
 *      is the oldest commit that ever touched the file, not the line.)
 *   2. With a pickaxe token, use `git log -S<token> --reverse` to find
 *      the commit where the token last disappeared/appeared. The pickaxe
 *      result is unambiguous: the first match IS the introducer of the
 *      current state of that token.
 *
 * Output is a small structured object: introducer commit + a truncated
 * diff. Truncation matters — a full patch can be megabytes; we cap to
 * keep the agent's context small.
 */
import { git, isGitRepo } from "./git-runner.js";

const MAX_DIFF_CHARS = 1500; // ~375-500 tokens, fits any conversation budget

/**
 * Parse a `git log -L <start>,<end>:<file>` output. The output is a series
 * of blocks, one per commit. Each block is:
 *
 *     <hash>|<author>|<date>|<subject>
 *     <blank>
 *     diff --git ...
 *     @@ -oldStart,oldCount +newStart,newCount @@ <context>
 *     <diff body>
 *
 * Returns the first commit (in --reverse order, so oldest first) whose diff
 * hunk actually has `+newStart,newCount` overlapping the requested line
 * range. The hunk's `+newStart` is 1-based, matching the requested range.
 */
function parseLineRangeLog(output, requestedStart, requestedEnd) {
  if (!output || !output.trim()) return null;
  // Split on the standard 4-line header that `git log --format=...` emits
  // before each diff. We re-join with a unique sentinel.
  const lines = output.split("\n");
  let i = 0;
  while (i < lines.length) {
    // Header: hash, author, date, subject — 4 lines, no diff content
    if (i + 4 > lines.length) return null;
    const hash = lines[i].trim();
    const author = lines[i + 1].trim();
    const date = lines[i + 2].trim();
    const subject = lines[i + 3].trim();
    if (!/^[0-9a-f]{40}$/.test(hash)) {
      i += 1;
      continue; // skip junk at the start
    }
    i += 4;
    // Find the first `@@` hunk header in this commit's diff.
    let foundHunk = null;
    while (i < lines.length && !lines[i].startsWith("diff --git")) {
      if (lines[i].startsWith("@@") && !foundHunk) {
        const m = lines[i].match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (m) {
          const hunkStart = parseInt(m[1], 10);
          const hunkCount = m[2] ? parseInt(m[2], 10) : 1;
          const hunkEnd = hunkStart + Math.max(hunkCount - 1, 0);
          // Does the requested line range overlap the hunk's new range?
          if (hunkStart <= requestedEnd && hunkEnd >= requestedStart) {
            foundHunk = { start: hunkStart, end: hunkEnd };
          }
        }
      }
      i += 1;
    }
    if (foundHunk) {
      return { hash, author, date, subject };
    }
    // No matching hunk in this commit; loop continues to next commit.
  }
  return null;
}

/**
 * @param {object} args
 * @param {string} args.file - path to the file (relative to cwd or absolute)
 * @param {number} [args.startLine] - 1-based first line of the range
 * @param {number} [args.endLine] - 1-based last line of the range
 * @param {string} [args.pickaxe] - token for `git log -S` when no line range
 * @param {string} [args.cwd] - working directory (defaults to process.cwd())
 * @param {number} [args.maxCommits] - how far back to look (default 50)
 */
export async function findIntroducer({ file, startLine, endLine, pickaxe, cwd, maxCommits = 50 } = {}) {
  if (!isGitRepo(cwd)) {
    return { ok: false, error: "当前目录不在 git 仓库内。请 cd 到项目根目录后重试。" };
  }
  if (!file) {
    return { ok: false, error: "需要 file 参数(文件路径)" };
  }
  if (!startLine && !pickaxe) {
    return { ok: false, error: "需要 startLine/endLine 或 pickaxe(搜索字符串)其中之一" };
  }

  let introducer = null;
  let mode;
  if (startLine) {
    const end = endLine || startLine;
    // -L<start>,<end>:<file> traces the lines through history.
    // --reverse puts OLDEST first.
    // --no-patch drops the per-commit diff body (we only need the headers).
    // We also need the diff for the introducer commit, so re-run with -p
    // and parse the matching hunk.
    const headerOutput = git(
      ["log", "-L", `${startLine},${end}:${file}`, "--reverse", `--max-count=${maxCommits}`, "--format=%H%n%an%n%aI%n%s"],
      { cwd }
    );
    mode = "line-range";
    introducer = parseLineRangeLog(headerOutput, startLine, end);
  } else {
    // pickaxe search for the token across the file's history.
    // --reverse: oldest first → the first match is the introducer of the
    // current state of the token.
    // Use --format=... with a unique marker so we can split the diff apart.
    const output = git(
      ["log", "-S", pickaxe, "-p", "--pickaxe-regex", "--format=%H|%an|%aI|%s", `--max-count=${maxCommits}`, "--", file],
      { cwd }
    );
    mode = "pickaxe";
    if (output) {
      const lines = output.split("\n");
      const headerLine = lines[0];
      const parts = headerLine?.split("|");
      if (parts?.length === 4 && /^[0-9a-f]{40}$/.test(parts[0])) {
        introducer = { hash: parts[0], author: parts[1], date: parts[2], subject: parts[3] };
      }
    }
  }

  if (!introducer) {
    return { ok: true, introducer: null, mode, detail: "未找到引入者(历史中没有相关改动)" };
  }

  // For pickaxe mode, also grab a diff preview so the agent sees the change.
  let diffPreview = null;
  if (mode === "pickaxe" && introducer.hash) {
    const diff = git(["show", "--no-color", "--format=", introducer.hash, "--", file], { cwd, allowFailure: true });
    if (diff) {
      diffPreview = diff.length > MAX_DIFF_CHARS
        ? diff.slice(0, MAX_DIFF_CHARS) + `\n... [truncated ${diff.length - MAX_DIFF_CHARS} chars]`
        : diff;
    }
  }

  return {
    ok: true,
    mode,
    introducer: {
      hash: introducer.hash,
      shortHash: introducer.hash.slice(0, 7),
      author: introducer.author,
      date: introducer.date,
      subject: introducer.subject,
    },
    diff: diffPreview,
    note: "这是该代码首次出现在仓库中的提交。它是引入者,也可能是后续改坏的提交——请结合 blame 二次确认。",
  };
}
