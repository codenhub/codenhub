import { mergeEnv, resolveCommand, runSync } from "../scripts/lib/proc.mjs";
import { classifyText } from "./common.mjs";

// For when Claude is NOT the orchestrator. While it is, its routes share the
// orchestrator's quota pool and dispatch answers use_native instead.

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
// Editing workers only; read-only ones get no shell. Claude checks every part
// of `cd "<repo>" && npm run test` and often writes commands that way, so `cd`
// is allowed; file tools stay confined regardless.
const READ_GIT = ["cd", "git status", "git diff", "git log", "git show"];
// Deny rules win over allow rules. These flags write to or read from any path
// (--output, --no-index) or run configured programs.
const GIT_FLAGS_DENIED = ["--output", "--no-index", "--ext-diff", "--textconv"];
const DENIAL = /permission|denied|not allowed|haven't granted/i;
// Kept from a parent Claude Code session: deliberate auth and config location.
const KEEP = new Set(["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR"]);
let detected;

/**
 * A parent Claude Code session (desktop app, CLI, SDK) exports session ids,
 * messaging sockets and tokens. A worker inheriting them could attach to that
 * session; it must start as its own.
 */
function hostEnv() {
  const strip = {};
  for (const k of Object.keys(process.env)) {
    if (/^CLAUDE/i.test(k) && !KEEP.has(k.toUpperCase())) {
      strip[k] = null;
    }
  }
  return strip;
}

/** Claude Code permission rules: `Bash(npm run test)` exact, `Bash(npm run test:*)` prefix. */
const bashRules = (cmds) => cmds.flatMap((c) => [`Bash(${c})`, `Bash(${c}:*)`]);

export default {
  name: "claude",

  /** Credentials this harness may log in with; dispatch strips other secrets. */
  authEnv: () => ["ANTHROPIC_*", "CLAUDE_CODE_OAUTH_TOKEN"],

  detect() {
    if (detected) {
      return detected;
    }
    const bin = resolveCommand("claude", process.env.DELEGATE_WORK_BIN_CLAUDE);
    if (!bin) {
      return (detected = { ok: false, reason: "not installed (https://claude.com/claude-code)" });
    }
    const env = mergeEnv(hostEnv());
    const v = runSync(bin, ["--version"], { timeout: 20000, env });
    if (v.status !== 0) {
      return (detected = { ok: false, reason: `failed to run: ${v.stderr?.toString().trim() || v.error?.message}` });
    }
    // Reports stored credentials, not whether they still refresh: an expired
    // login still says loggedIn and fails at run time as "auth".
    let status = null;
    try {
      status = JSON.parse(runSync(bin, ["auth", "status", "--json"], { timeout: 20000, env }).stdout.toString());
    } catch {
      // No readable status: the environment checks below decide.
    }
    if (!status?.loggedIn && !process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
      return (detected = { ok: false, reason: "not logged in (claude auth login)" });
    }
    return (detected = { ok: true, bin, version: v.stdout.toString().trim() });
  },

  command({ route, prompt, readOnly, allow, bashAllow, sessionId }) {
    // --restricted ignores user/project/local settings files, confines file
    // tools to the work dir and protects git and settings files. --tools is
    // the whole tool set: no subagents, web, notebooks or MCP.
    const tools = readOnly ? ["Read", "Glob", "Grep"] : ["Read", "Glob", "Grep", "Edit", "Write", "Bash"];
    const rules = readOnly
      ? tools
      : [...bashRules(READ_GIT), ...allow.map((g) => `Edit(${g})`), ...bashRules(bashAllow)];
    const denied = readOnly ? [] : ["--disallowedTools", ...GIT_FLAGS_DENIED.map((f) => `Bash(git *${f}*)`)];
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      route.model,
      "--restricted",
      "--tools",
      tools.join(","),
      "--allowedTools",
      ...rules,
      ...denied,
      "--permission-mode",
      "dontAsk",
      "--disable-slash-commands",
      "--strict-mcp-config",
      "--no-chrome",
    ];
    if (route.variant) {
      args.push("--effort", route.variant);
    }
    if (sessionId) {
      args.push("--resume", sessionId);
    }
    return { args, input: prompt, env: hostEnv() };
  },

  parseLine(line, acc) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (ev.session_id) {
      acc.sessionId = ev.session_id;
    }
    acc.pending ??= new Map();
    const content = Array.isArray(ev.message?.content) ? ev.message.content : [];
    switch (ev.type) {
      case "assistant":
        for (const c of content) {
          if (c.type === "text" && c.text) {
            acc.texts.push(c.text);
          }
          if (c.type === "tool_use") {
            acc.steps++;
            acc.pending.set(c.id, { name: c.name, input: c.input ?? {} });
          }
        }
        break;
      case "user":
        for (const c of content) {
          if (c.type !== "tool_result") {
            continue;
          }
          const call = acc.pending.get(c.tool_use_id);
          acc.pending.delete(c.tool_use_id);
          if (!call) {
            continue;
          }
          const file = call.input.file_path ?? call.input.notebook_path;
          if (!c.is_error && EDIT_TOOLS.has(call.name) && file) {
            acc.edits.push(file);
          }
          const text = typeof c.content === "string" ? c.content : JSON.stringify(c.content ?? "");
          if (c.is_error && DENIAL.test(text)) {
            acc.denied.push(`${call.name}: ${String(call.input.command ?? file ?? "").slice(0, 200)}`);
          }
        }
        break;
      case "result":
        acc.result = ev;
        if (ev.is_error) {
          acc.errors.push(String(ev.result ?? ev.subtype ?? "error"));
        }
        for (const d of ev.permission_denials ?? []) {
          acc.denied.push(
            `${d.tool_name}: ${String(d.tool_input?.command ?? d.tool_input?.file_path ?? "").slice(0, 200)}`,
          );
        }
        break;
    }
  },

  finalText: (acc) => (acc.result && !acc.result.is_error && acc.result.result) || acc.texts.at(-1) || "",

  // Aliases (sonnet, opus, haiku) and full ids both work; there is no listing command.
  models: () => null,

  classify({ code, acc, stderrTail }) {
    if (!acc.errors.length && code === 0) {
      return { kind: "ok" };
    }
    const final = [...new Set(acc.errors)].join("\n").trim();
    const message = [final, stderrTail].filter(Boolean).join("\n").trim();
    let c = classifyText(final);
    if (c.kind === "fatal") {
      c = classifyText(message);
    }
    return { ...c, message: message.slice(0, 500) };
  },
};
