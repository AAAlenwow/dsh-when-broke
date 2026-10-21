/**
 * dsh-when-broke — shared git runner.
 *
 * Every tool in this plugin ends up shelling out to `git` and parsing the
 * output. Centralising the spawn + error handling means each tool can be
 * three lines: "args → git() → format".
 */
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Run `git <args>` in `cwd` and return the trimmed stdout.
 * Throws on non-zero exit with stderr in the message so the agent sees the
 * real reason, not a generic "git failed".
 */
export function git(args, { cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS, allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024, // 16 MB — large repos with --stat
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("git is not installed or not on PATH");
    }
    throw new Error(`git error: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`git killed by signal ${result.signal} (timeout ${timeoutMs}ms)`);
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args[0]} exited ${result.status}: ${(result.stderr || "").trim().split("\n")[0]}`);
  }
  return (result.stdout || "").replace(/\n$/, "");
}

/**
 * Returns true if `cwd` is inside a git working tree. Cheap: one `rev-parse`.
 */
export function isGitRepo(cwd = process.cwd()) {
  try {
    // `git rev-parse --is-inside-work-tree` prints "true" / "false" to stdout
    // and exits 0 in both cases (when cwd is valid). We need to read the
    // actual output, not just the exit code.
    const out = git(["rev-parse", "--is-inside-work-tree"], { cwd, allowFailure: true });
    return out.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Resolves a path the user gave us (relative or absolute) against the
 * given cwd and verifies the file exists. Returns the absolute path or
 * throws with a message the agent can act on.
 */
export function resolveFilePath(path, cwd = process.cwd()) {
  if (!path || typeof path !== "string") {
    throw new Error("需要提供 file 路径(相对或绝对)");
  }
  return isAbsolute(path) ? path : resolve(cwd, path);
}
