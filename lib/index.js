/**
 * dsh-when-broke — git regression-finding tools.
 *
 * Exports 4 tools (also usable standalone or as part of the dsh-ai-armor bundle):
 *   1. when_broke_find_introducer   — who introduced this code?
 *   2. when_broke_recent_changes    — what's been touching this file lately?
 *   3. when_broke_bisect_with_repro — binary-search the bad commit
 *   4. when_broke_blame_age         — how old is this line?
 *
 * Each tool is `isConcurrencySafe: () => true` except bisect (which mutates
 * the git state). Cost/latency notes live in each tool's parameters.
 */
import { findIntroducer } from "./find-introducer.js";
import { recentChanges } from "./recent-changes.js";
import { bisectWithRepro } from "./bisect-with-repro.js";
import { blameAge } from "./blame-age.js";

export const tools = [
  {
    name: "when_broke_find_introducer",
    description:
      "定位一段代码「首次出现在仓库里的提交」。给定文件路径 + 行号(或 pickaxe 字符串)," +
      "返回引入该代码的 commit hash、作者、日期、提交信息和变更摘要(超出 1500 字会截断)。" +
      "使用场景:发现可疑代码、想反查它从哪来。注意:首次出现不一定是「根因」——可能是后续 commit 又改坏了。" +
      "代价:1 次 git log(中等仓库 50-300ms),输出约 1-2KB(~250-500 tokens)。",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "文件路径,相对或绝对" },
        startLine: { type: "integer", description: "起始行号(1-based)。与 endLine 一起用" },
        endLine: { type: "integer", description: "结束行号(1-based)。省略时=startLine" },
        pickaxe: { type: "string", description: "可选:pickaxe 搜索字符串,用于没有具体行号时(如 '==')" },
        cwd: { type: "string", description: "可选:git 仓库根目录,默认 process.cwd()" },
        maxCommits: { type: "integer", description: "可选:最多向前查多少个 commit,默认 50" },
      },
      required: ["file"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          introducer: {
            type: "object",
            properties: {
              hash: { type: "string" },
              shortHash: { type: "string" },
              author: { type: "string" },
              date: { type: "string" },
              subject: { type: "string" },
            },
          },
          mode: { type: "string" },
          diff: { type: "string" },
          note: { type: "string" },
          error: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (!value.ok) return [{ type: "text", text: `❌ ${value.error || "失败"}` }];
        if (!value.introducer) return [{ type: "text", text: value.detail || "未找到引入者" }];
        const i = value.introducer;
        const head = `引入者: ${i.shortHash} (${i.date})\n作者: ${i.author}\n提交: ${i.subject}\n模式: ${value.mode}`;
        const body = value.diff ? `\n\n变更预览:\n${value.diff}` : "";
        const tail = value.note ? `\n\n⚠️ ${value.note}` : "";
        return [{ type: "text", text: head + body + tail }];
      },
    },
    isConcurrencySafe: () => true,
    timeoutMs: 15_000,
    async execute(args) {
      return findIntroducer(args);
    },
  },
  {
    name: "when_broke_recent_changes",
    description:
      "列出某文件最近的 N 个 commit,按「风险分」从高到低排序。风险分基于:改动行数、" +
      "距今天数、commit message 是否含 fix/bug/regress/HOTFIX、作者数量。" +
      "使用场景:线上出 bug,想快速定位最近哪个改动最可疑。输出大小与 N 成正比," +
      "默认 10 个 commit 约 1-2KB(~250-500 tokens)。",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "文件路径" },
        limit: { type: "integer", description: "可选:列几个 commit,默认 10" },
        daysBack: { type: "integer", description: "可选:看最近几天的改动,默认 30" },
        cwd: { type: "string", description: "可选:git 仓库根目录" },
      },
      required: ["file"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          file: { type: "string" },
          count: { type: "integer" },
          commits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                shortHash: { type: "string" },
                author: { type: "string" },
                date: { type: "string" },
                subject: { type: "string" },
                adds: { type: "integer" },
                dels: { type: "integer" },
                ageDays: { type: "number" },
                risk: { type: "integer" },
              },
            },
          },
          error: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (!value.ok) return [{ type: "text", text: `❌ ${value.error}` }];
        if (value.count === 0) return [{ type: "text", text: value.note || "无改动" }];
        const lines = [`文件 ${value.file} 在最近 ${value.window || "30d"} 的改动(${value.count} 个 commit,按风险排序):`];
        for (const c of value.commits) {
          lines.push(`  [风险 ${c.risk}/10] ${c.shortHash} (${c.ageDays}d ago) +${c.adds}/-${c.dels} — ${c.subject} <${c.author}>`);
        }
        return [{ type: "text", text: lines.join("\n") + (value.note ? `\n\n💡 ${value.note}` : "") }];
      },
    },
    isConcurrencySafe: () => true,
    timeoutMs: 15_000,
    async execute(args) {
      return recentChanges(args);
    },
  },
  {
    name: "when_broke_bisect_with_repro",
    description:
      "用 `git bisect` 二分查找「第一个引入 bug 的 commit」。需要用户提供:已知好的 commit、" +
      "已知坏的 commit、复现命令(shell 单行)。⚠️ 每次调用会跑完整 bisect(对 N 个 commit 是 O(log N) 步)," +
      "每步执行 repro,大仓库 + 慢 repro 可能耗时数十秒。默认超时 60 秒。",
    parameters: {
      type: "object",
      properties: {
        good: { type: "string", description: "已知「好」的 commit hash(测试通过)" },
        bad: { type: "string", description: "已知「坏」的 commit hash(测试失败)" },
        repro: { type: "string", description: "复现命令,单行 shell。退出码 0=好,非 0=坏" },
        cwd: { type: "string", description: "可选:git 仓库根目录" },
        timeoutMs: { type: "integer", description: "可选:总超时(毫秒),默认 60000" },
      },
      required: ["good", "bad", "repro"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          firstBad: {
            type: "object",
            properties: {
              hash: { type: "string" },
              shortHash: { type: "string" },
              subject: { type: "string" },
              author: { type: "string" },
              date: { type: "string" },
            },
          },
          steps: { type: "integer" },
          elapsedMs: { type: "integer" },
          log: { type: "array", items: { type: "string" } },
          note: { type: "string" },
          error: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (!value.ok) {
          const last = value.log && value.log.length ? `\n\nbisect 日志:\n${value.log.slice(-10).join("\n")}` : "";
          return [{ type: "text", text: `❌ ${value.error}${last}` }];
        }
        const b = value.firstBad;
        return [{ type: "text", text:
          `✅ 找到第一个坏 commit: ${b.shortHash}\n` +
          `提交: ${b.subject}\n` +
          `作者: ${b.author} (${b.date})\n` +
          `耗时: ${(value.elapsedMs / 1000).toFixed(1)}s, ${value.steps} 步\n\n` +
          (value.note ? `⚠️ ${value.note}\n\n` : "") +
          `bisect 日志:\n${value.log.join("\n")}`
        }];
      },
    },
    isConcurrencySafe: () => false,
    timeoutMs: 120_000,
    async execute(args) {
      return bisectWithRepro(args);
    },
  },
  {
    name: "when_broke_blame_age",
    description:
      "显示某行代码的作者、提交时间和「年龄」。最便宜的 git 操作(<10ms)," +
      "用于「这行代码是新写的还是老代码」的快速判断。配合 find_introducer 用," +
      "可以先 blame 看新鲜度,再决定要不要深查。",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "文件路径" },
        line: { type: "integer", description: "行号(1-based)" },
        cwd: { type: "string", description: "可选:git 仓库根目录" },
      },
      required: ["file", "line"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          file: { type: "string" },
          line: { type: "integer" },
          author: { type: "string" },
          date: { type: "string" },
          ageDays: { type: "number" },
          commit: {
            type: "object",
            properties: {
              shortHash: { type: "string" },
              subject: { type: "string" },
            },
          },
          uncommitted: { type: "boolean" },
          note: { type: "string" },
          error: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (!value.ok) return [{ type: "text", text: `❌ ${value.error}` }];
        if (value.uncommitted) return [{ type: "text", text: `📝 ${value.file}:${value.line} 尚未提交(worktree 有改动)` }];
        return [{ type: "text", text:
          `👤 ${value.author} (${value.date}, ${value.ageDays}d ago)\n` +
          `   commit ${value.commit?.shortHash}: ${value.commit?.subject}\n` +
          (value.note ? `\n💡 ${value.note}` : "")
        }];
      },
    },
    isConcurrencySafe: () => true,
    timeoutMs: 5_000,
    async execute(args) {
      return blameAge(args);
    },
  },
];
