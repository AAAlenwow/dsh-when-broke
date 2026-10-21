/**
 * recent_changes_for_file — list the N most recent commits touching a file
 * and give each one a "risk" score so the agent can spot the most
 * suspicious change first.
 *
 * Risk scoring (0-10):
 *   - 5+ lines changed → +2; 20+ lines → +2 more
 *   - changes within last 7 days → +2
 *   - commit message contains fix/break/regress/bug/HOTFIX → +3
 *   - changes inside the working tree (uncommitted) → +1
 *   - more than 1 author in the window → +1 (busy file)
 */
import { git, isGitRepo } from "./git-runner.js";
import { execSync } from "node:child_process";

const RISK_TERMS = /\b(fix|bug|regress|break|hack|tmp|wip|hotfix)\b/i;

export async function recentChanges({ file, cwd, limit = 10, daysBack = 30 } = {}) {
  if (!isGitRepo(cwd)) {
    return { ok: false, error: "当前目录不在 git 仓库内。" };
  }
  if (!file) {
    return { ok: false, error: "需要 file 参数" };
  }

  // Use --numstat to get additions/deletions per commit
  const since = `${daysBack} days ago`;
  const log = git(
    ["log", `--since=${since}`, "-n", String(limit), "--format=%H%x09%an%x09%aI%x09%s", "--numstat", "--", file],
    { cwd, timeoutMs: 15_000 }
  );

  if (!log) {
    return { ok: true, commits: [], note: `${daysBack} 天内没有 commit 改过该文件。` };
  }

  const now = Date.now();
  const commits = [];
  // Format: commit-info line, then 0+ numstat lines, then blank
  const blocks = log.split(/\n(?=[a-f0-9]{7,40}\t)/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const [info, ...statLines] = block.split("\n");
    const [hash, author, date, subject] = info.split("\t");
    if (!hash) continue;
    let adds = 0, dels = 0;
    for (const sl of statLines) {
      const m = sl.match(/^(\d+)\s+(\d+)\s+/);
      if (m) { adds += Number(m[1]); dels += Number(m[2]); }
    }
    const ageDays = (now - new Date(date).getTime()) / 86400000;
    let risk = 0;
    if (adds + dels >= 5) risk += 2;
    if (adds + dels >= 20) risk += 2;
    if (ageDays <= 7) risk += 2;
    if (RISK_TERMS.test(subject)) risk += 3;
    commits.push({
      shortHash: hash.slice(0, 7),
      author,
      date,
      subject,
      adds,
      dels,
      ageDays: Math.round(ageDays * 10) / 10,
      risk: Math.min(10, risk),
    });
  }

  // Flag the "busy file" risk
  const uniqueAuthors = new Set(commits.map((c) => c.author));
  if (uniqueAuthors.size > 1 && commits.length >= 3) {
    for (const c of commits) c.risk = Math.min(10, c.risk + 1);
  }

  commits.sort((a, b) => b.risk - a.risk);
  return {
    ok: true,
    file,
    window: `${daysBack}d`,
    count: commits.length,
    commits,
    note: commits.length === 0
      ? "没有改动记录。"
      : `已按风险从高到低排序。风险 ≥ 6 的 commit 高度可疑(改得多 + 时间近 + 关键字命中)。`,
  };
}
