/**
 * bisect_with_repro — run a full `git bisect run` programmatically with a
 * user-provided reproduction command. Returns the first bad commit plus
 * the bisect log so the agent can show "how we got there".
 *
 * We use `git bisect run` (the built-in scripted form) instead of step-by-step
 * bisect, because step-by-step has a subtle bug: when the range has only
 * 2 commits left and the midpoint is the known-bad one, HEAD doesn't move,
 * and a step-by-step loop spins forever re-marking the same commit.
 *
 * `git bisect run` handles convergence correctly out of the box.
 *
 * Important: this REPLAYS bisect every call. We do NOT cache results, and
 * we run `git bisect reset` at the end regardless of outcome so the
 * repo is left clean.
 *
 * Cost warning: each step forks the repro command. For a 20-commit range
 * with 5s repro, that's ~30s of wall time. The agent should ask the user
 * before invoking this for large ranges.
 */
import { git, isGitRepo } from "./git-runner.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_STEPS = 32; // log2 of typical 100k-commit repo; bounds runaway bisect

export async function bisectWithRepro({ good, bad, repro, cwd, timeoutMs = 60_000 } = {}) {
  if (!isGitRepo(cwd)) {
    return { ok: false, error: "当前目录不在 git 仓库内。" };
  }
  if (!good || !bad || !repro) {
    return { ok: false, error: "需要 good(已知好 commit)、bad(已知坏 commit)、repro(复现命令)三个参数" };
  }
  if (typeof repro !== "string" || repro.includes("\n")) {
    return { ok: false, error: "repro 必须是单行命令(不能含换行;若需多步请包成 shell 脚本)" };
  }

  const t0 = Date.now();
  let tmpDir = null;
  const log = [];

  // Always reset first in case a previous bisect was interrupted
  try { git(["bisect", "reset"], { cwd, allowFailure: true }); } catch {}

  // Wrap the repro in a small shell script so `git bisect run` can call it.
  // The script must exit 0 = good, 1 = bad, 125 = skip-this-commit.
  tmpDir = mkdtempSync(join(tmpdir(), "dsh-when-broke-"));
  const reproScript = join(tmpDir, "repro.sh");
  writeFileSync(reproScript, `#!/usr/bin/env bash\nset -e\ncd "${cwd}"\n${repro}\n`, { mode: 0o755 });

  try {
    git(["bisect", "start"], { cwd });
    log.push("bisect start");
    git(["bisect", "bad", bad], { cwd });
    log.push(`bisect bad ${bad.slice(0, 7)}`);
    git(["bisect", "good", good], { cwd });
    log.push(`bisect good ${good.slice(0, 7)}`);

    // Tell git to skip commits that can't be tested (e.g. build failure).
    // The script exits 125 if repro can't run; git bisect treats that as skip.
    const r = spawnSync("git", [
      "bisect", "run",
      // Lower default term-quiet to false so we see git's own step output.
      // We capture stdout/stderr into log below.
      reproScript,
    ], { cwd, encoding: "utf8", timeout: timeoutMs });

    if (r.error) {
      git(["bisect", "reset"], { cwd, allowFailure: true });
      return { ok: false, error: `git bisect run 启动失败: ${r.error.message}`, log };
    }
    if (r.status === 124) {
      git(["bisect", "reset"], { cwd, allowFailure: true });
      return { ok: false, error: `超时(${timeoutMs}ms),已重置。请提高 timeoutMs 或缩小范围。`, log };
    }
    if (r.status !== 0 && r.status !== 1) {
      git(["bisect", "reset"], { cwd, allowFailure: true });
      return { ok: false, error: `git bisect run 异常退出 (status=${r.status}): ${(r.stderr || r.stdout || "").trim().slice(0, 300)}`, log };
    }

    // Capture git's own step-by-step output for the agent-visible log.
    if (r.stdout) {
      // Keep only relevant lines to avoid bloat.
      for (const line of r.stdout.split("\n")) {
        if (/^Bisecting:|^[0-9a-f]{7,}/.test(line.trim())) {
          log.push(line.trim());
        }
      }
    }

    // Read the result: `git bisect log` ends with `# first bad commit: [<sha>] <subject>`.
    // The stdout from `git bisect run` also contains `<sha> is the first bad commit`
    // on its own line — use that as a primary signal because it appears even when
    // bisect log is very long.
    let firstBad = null;
    if (r.stdout) {
      const m = r.stdout.match(/^([0-9a-f]{7,40}) is the first bad commit/m);
      if (m) firstBad = m[1];
    }
    const bisectLog = git(["bisect", "log"], { cwd, allowFailure: true });
    if (!firstBad) {
      const m = bisectLog.match(/^# first bad commit: \[([0-9a-f]{7,40})\]/m);
      if (m) firstBad = m[1];
      if (!firstBad) {
        git(["bisect", "reset"], { cwd, allowFailure: true });
        return { ok: false, error: `git bisect 未能收敛:\n${bisectLog.slice(0, 800)}`, log };
      }
    }
    const subject = git(["log", "-1", "--format=%s", firstBad], { cwd });
    const author = git(["log", "-1", "--format=%an", firstBad], { cwd });
    const date = git(["log", "-1", "--format=%aI", firstBad], { cwd });

    const stepsMatch = bisectLog.match(/^([0-9]+) revisions left/);
    const stepsLeft = stepsMatch ? parseInt(stepsMatch[1], 10) : null;

    git(["bisect", "reset"], { cwd, allowFailure: true });
    return {
      ok: true,
      firstBad: { hash: firstBad, shortHash: firstBad.slice(0, 7), subject, author, date },
      stepsRemaining: stepsLeft,
      elapsedMs: Date.now() - t0,
      log,
      note: `用 git bisect run 自动定位到引入者。重要:这是「第一个被 bisect 标记为 bad 的 commit」,可能不是真正的根因(如果中间有人 revert 过,会落到 revert 那个 commit)。`,
    };
  } catch (e) {
    try { git(["bisect", "reset"], { cwd, allowFailure: true }); } catch {}
    return { ok: false, error: e.message, log };
  } finally {
    if (tmpDir) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}
