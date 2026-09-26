import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonical } from "../scripts/lib/glob.mjs";
import { mergeEnv, resolveCommand, runSync } from "../scripts/lib/proc.mjs";
import { baseDir } from "../scripts/lib/state.mjs";
import { classifyText, stripAnsi } from "./common.mjs";

const WIN = process.platform === "win32";
const MIN_VERSION = [1, 1, 1];
const EDIT_TOOLS = new Set([
  "write_to_file",
  "replace_file_content",
  "multi_replace_file_content",
  "sed_file",
  "notebook_edit",
]);
const DENIAL = /permission check failed|denied permission|permission denied for/i;
// A `deny` is refused and the turn goes on. Anything that resolves to "ask"
// (no rule either way) is refused too, but it ends the whole turn.
const DENY = ["read_url(*)", "execute_url(*)", "mcp(*)"];
// Each agent's whole tool set. Everything else (web search, browser,
// subagents, image generation, scheduling, messaging) is left out.
const READ_TOOLS = ["view_file", "list_dir", "find_by_name", "grep_search"];
const WRITE_TOOLS = ["write_to_file", "replace_file_content", "multi_replace_file_content"];
const AGENTS = {
  "dispatch-read": READ_TOOLS,
  "dispatch-edit": [...READ_TOOLS, ...WRITE_TOOLS],
  "dispatch-edit-shell": [...READ_TOOLS, ...WRITE_TOOLS, "run_command"],
};
let detected;

const PATHS_NOTE = `In your report, write file paths as plain paths relative to the
repository root, not as links.`;

const NO_SHELL_NOTE = `

Environment note: you have no shell here, so you can't run any checks. Read,
search and edit with your file tools. The checks run automatically after you
finish; don't report them as blocked. ${PATHS_NOTE}`;

const shellNote = (cmds) => `

Environment note: the only shell commands you can run are these, each exactly
as written, alone: ${cmds.map((c) => `\`${c}\``).join(", ")}. Any other command,
any variation of these, or any command chained to them ends your session
before you can report. Read, search and edit with your file tools. ${PATHS_NOTE}`;

const agentFile = (name, tools) =>
  `---
name: ${name}
description: Scoped non-interactive worker
tools:
${tools.map((t) => `  - ${t}`).join("\n")}
inheritMcp: false
inheritCustomizations: false
---
You are a non-interactive worker. Do the task you are given with the tools you have.
`;

const agyHomeDir = () => path.join(baseDir(), "agy-home");

/**
 * agy reads settings, agents, projects, MCP servers, plugins, skills and
 * permission grants from ~/.gemini, located through USERPROFILE (Windows) or
 * HOME. Workers get a home of their own in the state dir: none of the user's
 * grants (MCP tools, URLs, file access outside the workspace) apply, and the
 * worker agents and rules are set without touching the user's configuration.
 * Credentials are not in ~/.gemini: on Windows they're in the Credential
 * Manager.
 */
function agyHome() {
  const gemini = path.join(agyHomeDir(), ".gemini");
  const settings = `${JSON.stringify({ permissions: { deny: DENY } }, null, 2)}\n`;
  writeShared(path.join(gemini, "antigravity-cli", "settings.json"), settings);
  for (const [name, tools] of Object.entries(AGENTS)) {
    writeShared(path.join(gemini, "config", "agents", name, "agent.md"), agentFile(name, tools));
  }
  return agyHomeDir();
}

/**
 * Concurrent runs share the home, and agy may be reading these files while
 * another run starts: a file is only written when its content changes, and
 * then replaced whole, never truncated in place.
 */
function writeShared(file, content) {
  try {
    if (fs.readFileSync(file, "utf8") === content) {
      return;
    }
  } catch {
    // Not written yet.
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

const inside = (dir, file) => {
  const rel = path.relative(dir, file);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
};

/**
 * The grants that differ per run live in an agy project, selected with
 * --project: settings.json is shared by concurrent runs. In a fresh home
 * nothing outside the temp dir is writable, not even the work dir, and
 * headless agy matches command rules exactly: `npm run test` doesn't allow
 * `npm run test -- x` or `npm run test && x`. A command also needs its
 * `unsandboxed` grant. The id is derived from the grants, so a follow-up
 * selects the same project.
 */
function project(cwd, readOnly, cmds) {
  const dir = canonical(cwd);
  const tmp = canonical(os.tmpdir());
  const allow = readOnly ? [] : [`write_file(${dir})`, ...cmds.flatMap((c) => [`command(${c})`, `unsandboxed(${c})`])];
  // agy lets any tool read and write the temp dir.
  const deny = inside(tmp, dir) ? [] : [`read_file(${tmp})`, `write_file(${tmp})`];
  const grants = { allow, deny };
  const id = `dispatch-${crypto.createHash("sha1").update(JSON.stringify(grants)).digest("hex").slice(0, 12)}`;
  const file = path.join(agyHomeDir(), ".gemini", "config", "projects", `${id}.json`);
  writeShared(file, `${JSON.stringify({ id, name: id, permissionGrants: { permissionGrants: grants } }, null, 2)}\n`);
  return id;
}

const homeEnv = (home) => ({ HOME: home, ...(WIN ? { USERPROFILE: home } : {}) });

/** Paths under the worker's agy home (plans, walkthroughs) are agy's own notes, not edits. */
const insideHome = (file) => inside(agyHomeDir(), canonical(path.resolve(file)));

function versionOk(v) {
  const n = (v.match(/\d+(?:\.\d+)*/)?.[0] ?? "0").split(".").map(Number);
  for (let i = 0; i < MIN_VERSION.length; i++) {
    if ((n[i] ?? 0) !== MIN_VERSION[i]) {
      return (n[i] ?? 0) > MIN_VERSION[i];
    }
  }
  return true;
}

/** `agy models` prints `<id>\t<label>` per line. */
function listModels(bin) {
  const r = runSync(bin, ["models"], { timeout: 60000, env: mergeEnv(homeEnv(agyHome())) });
  if (r.status !== 0) {
    return { error: stripAnsi(`${r.stderr ?? ""}${r.stdout ?? ""}`).trim() || r.error?.message || `exit ${r.status}` };
  }
  const ids = stripAnsi(r.stdout.toString())
    .split(/\r?\n/)
    .map((l) => l.match(/^([\w.-]+)\t/)?.[1])
    .filter(Boolean);
  return { ids };
}

const target = (p = {}) =>
  p.CommandLine ??
  p.TargetFile ??
  p.NotebookPath ??
  p.File ??
  p.AbsolutePath ??
  p.DirectoryPath ??
  p.SearchDirectory ??
  p.SearchPath ??
  p.Url ??
  "";

export default {
  name: "agy",

  detect() {
    if (detected) {
      return detected;
    }
    const bin = resolveCommand("agy", process.env.DELEGATE_WORK_BIN_AGY);
    if (!bin) {
      return (detected = { ok: false, reason: "not installed (winget install Google.AntigravityCLI)" });
    }
    const v = runSync(bin, ["--version"], { timeout: 20000 });
    if (v.status !== 0) {
      return (detected = { ok: false, reason: `failed to run: ${v.stderr?.toString().trim() || v.error?.message}` });
    }
    const version = v.stdout.toString().trim();
    // Earlier headless runs hang in a subprocess and print nothing on server errors.
    if (!versionOk(version)) {
      return (detected = {
        ok: false,
        reason: `version ${version} is too old; need ${MIN_VERSION.join(".")}+ (agy update)`,
      });
    }
    // Listing models needs a signed-in account; it also proves the isolated home works.
    const listed = listModels(bin);
    if (!listed.ids?.length) {
      return (detected = {
        ok: false,
        reason: `not signed in or unreachable (run agy once to sign in): ${(listed.error ?? "no models listed").split("\n")[0]}`,
      });
    }
    return (detected = { ok: true, bin, version, models: listed.ids });
  },

  command({ route, cwd, prompt, readOnly, bashAllow, sessionId }) {
    const cmds = readOnly ? [] : bashAllow;
    const home = agyHome();
    // Print mode starts from --input-format alone; -p would take the next flag as its prompt.
    const args = [
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--model",
      route.model,
      "--agent",
      readOnly ? "dispatch-read" : cmds.length ? "dispatch-edit-shell" : "dispatch-edit",
      "--project",
      project(cwd, readOnly, cmds),
      "--disable-slash-commands",
    ];
    if (route.variant) {
      args.push("--effort", route.variant);
    }
    if (sessionId) {
      args.push("--conversation", sessionId);
    }
    const note = sessionId ? "" : cmds.length ? shellNote(cmds) : NO_SHELL_NOTE;
    const input = `${JSON.stringify({ event: "user", message: { content: prompt + note } })}\n`;
    return { args, input, env: homeEnv(home) };
  },

  parseLine(line, acc) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    const id = ev.conversation_id ?? ev.step_update?.conversation_id ?? ev.result?.conversation_id;
    if (id) {
      acc.sessionId = id;
    }
    switch (ev.event) {
      case "step_update": {
        const u = ev.step_update ?? {};
        if (u.step_type === "agent_response" && u.text_delta) {
          if (acc.textStep !== u.step_index) {
            acc.textStep = u.step_index;
            acc.texts.push("");
          }
          acc.texts[acc.texts.length - 1] += u.text_delta;
        }
        if (u.step_type !== "tool") {
          break;
        }
        const tool = u.tool_name ?? u.tool_info?.name ?? "tool";
        const params = u.tool_info?.parameters ?? {};
        if (u.state === "ACTIVE") {
          acc.steps++;
        }
        const file = params.TargetFile ?? params.NotebookPath ?? params.File;
        if (u.state === "DONE" && EDIT_TOOLS.has(tool) && file && !insideHome(file)) {
          acc.edits.push(file);
        }
        const err = u.tool_info?.error?.message;
        if (u.state === "ERROR" && err && DENIAL.test(err)) {
          acc.denied.push(`${tool}: ${String(target(params)).slice(0, 200)}`);
        }
        break;
      }
      case "result": {
        const r = ev.result ?? {};
        acc.result = r;
        if (r.status !== "SUCCESS") {
          acc.errors.push(String(r.error || r.status || "error"));
        }
        break;
      }
    }
  },

  /** A tool that needed approval ended the turn; only stderr says so. */
  parseStderr(stderr, acc) {
    const m = (stderr ?? "").match(/a tool required the "([^"]+)" permission that headless mode cannot prompt for/);
    if (m) {
      acc.denied.push(`${m[1]}: needs approval, which headless agy can't ask for; the worker's session ended there`);
    }
  },

  // The result's response concatenates every message; the RESULT block is in the last.
  finalText: (acc) => acc.texts.join("\n") || acc.result?.response || "",

  /** Ids only: agy doesn't report context windows. */
  models() {
    const d = this.detect();
    return d.ok ? new Map(d.models.map((id) => [id, { context: null }])) : null;
  },

  probe() {
    if (!this.detect().ok) {
      return [];
    }
    return [
      "editing workers may run only the exact check commands; any other command ends the worker's session",
      `workers use their own agy home (${agyHomeDir()}); your ~/.gemini settings, grants, MCP servers, plugins and skills don't apply`,
    ];
  },

  classify({ code, acc, stderrTail }) {
    if (!acc.errors.length && code === 0 && acc.result?.status === "SUCCESS") {
      return { kind: "ok" };
    }
    const final = [...new Set(acc.errors)].join("\n").trim();
    const message = [final, stderrTail].filter(Boolean).join("\n").trim() || `exit ${code}, no result`;
    let c = classifyText(final);
    if (c.kind === "fatal") {
      c = classifyText(message);
    }
    return { ...c, message: message.slice(0, 500) };
  },
};
