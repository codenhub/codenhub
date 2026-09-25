import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveCommand, runSync } from "../scripts/lib/proc.mjs";
import { classifyText } from "./common.mjs";

const WIN = process.platform === "win32";
const STEP_ITEMS = new Set(["command_execution", "file_change", "mcp_tool_call", "web_search"]);
// Features a scoped worker must not have: its own subagents, browsers and
// computer use, plugins, image generation, dependency installs.
const DISABLED = [
  "multi_agent",
  "computer_use",
  "browser_use",
  "browser_use_external",
  "in_app_browser",
  "image_generation",
  "plugins",
  "apps",
  "goals",
  "skill_mcp_dependency_install",
];
const DENIAL = /access is denied|blocked by policy|rejected\(|refusing to run unsandboxed/i;
let detected;

const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const windowsSandbox = (route) => route.windowsSandbox ?? "unelevated";

// The unelevated Windows sandbox refuses child processes with piped stdio
// (spawn EPERM), which most test runners use. Workers are told so they don't
// spend steps fighting it; dispatch runs the checks outside the sandbox.
const SANDBOX_NOTE = `

Environment note: your sandbox may refuse to start child processes (errors
such as "spawn EPERM" or "Access is denied"), which breaks some test runners.
That is the sandbox, not your change: do not work around it or change
configuration. The same checks run outside the sandbox after you finish.`;

/** `"C:\...\powershell.exe" -Command 'npm run test'` → `npm run test`. */
function shortCommand(cmd) {
  const s = String(cmd ?? "");
  const m = s.match(/\s-(?:Command|c)\s+(['"])([\s\S]*)\1\s*$/i) ?? s.match(/\s\/c\s+(['"]?)([\s\S]*)\1\s*$/i);
  return (m ? m[2] : s).slice(0, 200);
}

/** Codex error messages are often a JSON response body inside a string. */
function errorText(msg) {
  try {
    const j = JSON.parse(msg);
    const inner = j.error?.message ?? j.message ?? msg;
    return j.status ? `HTTP ${j.status}: ${inner}` : String(inner);
  } catch {
    return String(msg ?? "unknown error");
  }
}

export default {
  name: "codex",

  detect() {
    if (detected) {
      return detected;
    }
    const bin = resolveCommand("codex", process.env.DELEGATE_WORK_BIN_CODEX);
    if (!bin) {
      return (detected = { ok: false, reason: "not installed (npm i -g @openai/codex)" });
    }
    const v = runSync(bin, ["--version"], { timeout: 20000 });
    if (v.status !== 0) {
      return (detected = { ok: false, reason: `failed to run: ${v.stderr?.toString().trim() || v.error?.message}` });
    }
    const login = runSync(bin, ["login", "status"], { timeout: 20000 });
    const status = `${login.stdout ?? ""}${login.stderr ?? ""}`.trim();
    if (!/logged in/i.test(status) || /not logged in/i.test(status)) {
      return (detected = { ok: false, reason: "not logged in (codex login)" });
    }
    return (detected = { ok: true, bin, version: v.stdout.toString().trim(), login: status });
  },

  command({ route, cwd, prompt, readOnly, sessionId }) {
    // User config is ignored: it can load plugins, MCP servers and notify
    // hooks. Everything a worker needs is set here.
    const opts = [
      "--json",
      "--ignore-user-config",
      "-m",
      route.model,
      "-c",
      `sandbox_mode=${readOnly ? "read-only" : "workspace-write"}`,
      "-c",
      "approval_policy=never",
      "-c",
      "web_search=disabled",
      "-c",
      "sandbox_workspace_write.network_access=false",
      ...DISABLED.flatMap((f) => ["--disable", f]),
    ];
    if (WIN) {
      opts.push("-c", `windows.sandbox=${windowsSandbox(route)}`);
    }
    if (route.variant) {
      opts.push("-c", `model_reasoning_effort=${route.variant}`);
    }
    // resume has no --cd; the process cwd is the work dir either way.
    const args = sessionId ? ["exec", "resume", ...opts, sessionId, "-"] : ["exec", ...opts, "-C", cwd, "-"];
    const note = WIN && windowsSandbox(route) === "unelevated" && !sessionId ? SANDBOX_NOTE : "";
    return { args, input: prompt + note, env: {} };
  },

  parseLine(line, acc) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    const item = ev.item ?? {};
    switch (ev.type) {
      case "thread.started":
        if (ev.thread_id) {
          acc.sessionId = ev.thread_id;
        }
        break;
      case "item.started":
        if (STEP_ITEMS.has(item.type)) {
          acc.steps++;
        }
        break;
      case "item.completed":
        if (item.type === "agent_message" && item.text) {
          acc.texts.push(item.text);
        }
        if (item.type === "file_change" && item.status === "completed") {
          for (const c of item.changes ?? []) {
            if (c.path) {
              acc.edits.push(c.path);
            }
          }
        }
        if (
          item.type === "command_execution" &&
          item.exit_code !== 0 &&
          DENIAL.test(String(item.aggregated_output ?? ""))
        ) {
          acc.denied.push(`shell: ${shortCommand(item.command)}`);
        }
        // item type "error" is a warning (e.g. missing model metadata); the
        // fatal ones arrive as "error" / "turn.failed" events.
        break;
      case "error":
        acc.errors.push(errorText(ev.message));
        break;
      case "turn.failed":
        acc.errors.push(errorText(ev.error?.message));
        break;
    }
  },

  /** Commands the sandbox refused before they started are only logged on stderr. */
  parseStderr(stderr, acc) {
    for (const m of (stderr ?? "").matchAll(/Rejected\(\\?"`?(.*?)`? rejected: ([^"\\]+)/g)) {
      acc.denied.push(`shell: ${shortCommand(m[1].replace(/\\\\/g, "\\"))} (${m[2]})`);
    }
    if (/refusing to run unsandboxed|setup refresh had errors/.test(stderr ?? "")) {
      acc.denied.push("shell: every command (the Codex sandbox could not start; see logPath)");
    }
  },

  /**
   * Models from Codex's own cache (refreshed by any run). The usable window is
   * context_window × effective_context_window_percent: Codex compacts there.
   */
  models() {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(codexHome(), "models_cache.json"), "utf8"));
      return new Map(
        (c.models ?? [])
          .filter((m) => m.slug)
          .map((m) => [
            m.slug,
            {
              context: m.context_window
                ? Math.floor((m.context_window * (m.effective_context_window_percent ?? 100)) / 100)
                : null,
            },
          ]),
      );
    } catch {
      return null;
    }
  },

  /** Doctor only: what the sandbox allows on this machine. */
  probe(route = {}) {
    const d = this.detect();
    if (!d.ok || !WIN) {
      return [];
    }
    const notes = [];
    const box = (mode, code) =>
      runSync(
        d.bin,
        [
          "sandbox",
          "-c",
          `windows.sandbox=${mode}`,
          "-c",
          "sandbox_mode=workspace-write",
          "--",
          process.execPath,
          "-e",
          code,
        ],
        { timeout: 60000, cwd: os.tmpdir() },
      );
    const elevated = box("elevated", "process.exit(0)");
    notes.push(
      elevated.status === 0
        ? 'elevated Windows sandbox works; set "windowsSandbox": "elevated" on codex routes to use it'
        : `elevated Windows sandbox unavailable: ${`${elevated.stdout}${elevated.stderr}`.trim().split(/\r?\n/)[0]}`,
    );
    const pipes = box(
      windowsSandbox(route),
      "process.exit(require('child_process').spawnSync(process.execPath,['-e','0'],{stdio:'pipe'}).error?3:0)",
    );
    if (pipes.status === 3) {
      notes.push(
        `${windowsSandbox(route)} sandbox refuses piped child processes (spawn EPERM): workers can't run most test runners; dispatch still runs checks outside the sandbox`,
      );
    } else if (pipes.status !== 0) {
      notes.push(
        `${windowsSandbox(route)} sandbox failed to start: ${`${pipes.stdout}${pipes.stderr}`.trim().split(/\r?\n/)[0]}`,
      );
    }
    return notes;
  },

  finalText: (acc) => acc.texts.at(-1) ?? "",

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
