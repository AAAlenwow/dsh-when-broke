/**
 * blame_age — show who wrote a line and how long ago. Cheap, fast, useful
 * for "is this old code or new code" follow-ups.
 */
import { git, isGitRepo } from "./git-runner.js";

export async function blameAge({ file, line, cwd } = {}) {
  if (!isGitRepo(cwd)) {
    return { ok: false, error: "当前目录不在 git 仓库内。" };
  }
  if (!file || !line) {
    return { ok: false, error: "需要 file 和 line 参数(line 必须是 1-based 行号)" };
  }

  const lineNum = Number(line);
  if (!Number.isInteger(lineNum) || lineNum < 1) {
    return { ok: false, error: `line 必须是正整数,收到: ${line}` };
  }

  // git blame -L <n>,<n>+1 — porcelain for stable parsing
  const out = git(["blame", "-L", `${lineNum},${lineNum + 1}`, "--porcelain", file], { cwd });
  if (!out) {
    return { ok: false, error: "blame 输出为空(文件可能是未跟踪的?)" };
  }

  // First line: <sha> <orig-line> <final-line> [<count>]
  const firstLine = out.split("\n")[0];
  const parts = firstLine.split(/\s+/);
  const sha = parts[0];
  if (!/^[a-f0-9]{7,40}$/.test(sha)) {
    return { ok: false, error: `无法解析 blame 输出: ${firstLine}` };
  }
  const isUncommitted = sha === "0000000000000000000000000000000000000000";

  if (isUncommitted) {
    return { ok: true, file, line: lineNum, uncommitted: true, note: "该行为未提交修改(worktree dirty)" };
  }

  // Parse porcelain for author + committer-time + summary
  const authorMatch = out.match(/^author (.+)$/m);
  const timeMatch = out.match(/^author-time (\d+)$/m);
  const summaryMatch = out.match(/^summary (.+)$/m);
  const author = authorMatch ? authorMatch[1] : "?";
  const authorTime = timeMatch ? Number(timeMatch[1]) : 0;
  const date = new Date(authorTime * 1000).toISOString();
  const summary = summaryMatch ? summaryMatch[1] : "";
  const ageDays = Math.round((Date.now() / 1000 - authorTime) / 86400 * 10) / 10;

  // Get the commit subject
  const subject = git(["log", "-1", "--format=%s", sha], { cwd });

  return {
    ok: true,
    file,
    line: lineNum,
    author,
    date,
    ageDays,
    commit: { shortHash: sha.slice(0, 7), subject },
    summary,
    note: ageDays > 365
      ? `该行已存在 ${Math.round(ageDays / 30)} 个月,大概率不是最近 bug 的根因。`
      : ageDays > 90
      ? `该行已存在 ${Math.round(ageDays / 30)} 个月,建议结合 find_introducer 二次确认。`
      : "该行为近期提交,值得优先检查。",
  };
}
