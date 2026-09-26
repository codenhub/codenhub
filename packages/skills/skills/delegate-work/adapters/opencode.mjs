import fs from "node:fs";
import path from "node:path";

import { resolveCommand, runSync } from "../scripts/lib/proc.mjs";
import { classifyText, stripAnsi } from "./common.mjs";

const EDIT_TOOLS = new Set(["edit", "write", "patch", "multiedit", "apply_patch"]);
// Editing workers only; read-only ones get no shell. The denied flags write
// to or read from any path (--output, --no-index) or run configured programs.
const READ_GIT = ["git status", "git diff", "git log", "git show"];
const GIT_FLAGS_DENIED = ["--output", "--no-index", "--ext-diff", "--textconv"];
// OpenCode 2 actions a worker never needs. Anything left unmatched resolves
// to "ask", which `run` can't answer: it aborts the step and the run.
const DENIED_V2 = ["webfetch", "websearch", "external_directory", "subagent", "question", "skill", "execute"];
let detected;

// Edit permission patterns are paths relative to the work dir. OpenCode's "*"
// matches across separators; 1.x may see backslashes on Windows, 2.x
// normalizes them.
const editPattern = (glob) => glob.replace(/\*\*\/?/g, "*");
const bothSlashes = (p) => [...new Set([p, p.replace(/\//g, "\\")])];

/** 1.x: permissions grouped by tool, in `agent.<name>.permission`. */
function agentV1({ route, readOnly, allow, bashAllow }) {
  const bash = { "*": "deny" };
  if (!readOnly) {
    for (const c of READ_GIT) {
      bash[`${c}*`] = "allow";
    }
    for (const c of bashAllow) {
      bash[c] = "allow";
      bash[`${c} *`] = "allow";
    }
    for (const f of GIT_FLAGS_DENIED) {
      bash[`git *${f}*`] = "deny";
    }
  }
  let edit = "deny";
  if (!readOnly) {
    edit = { "*": "deny" };
    for (const g of allow) {
      for (const p of bothSlashes(editPattern(g))) {
        edit[p] = "allow";
      }
    }
  }
  return {
    agent: {
      "dispatch-worker": {
        mode: "primary",
        description: "Scoped non-interactive worker",
        permission: {
          edit,
          bash,
          webfetch: "deny",
          websearch: "deny",
          external_directory: "deny",
          task: "deny",
          question: "deny",
          doom_loop: "deny",
        },
        ...route.options,
      },
    },
  };
}

/** 2.x: an ordered rule list in `agents.<name>.permissions`; the last match wins. */
function agentV2({ route, readOnly, allow, bashAllow }) {
  const rule = (action, resource, effect) => ({ action, resource, effect });
  const permissions = [
    rule("read", "*", "allow"),
    // Reading .env files resolves to "ask" by default.
    rule("read", "*.env", "deny"),
    rule("read", "*.env.*", "deny"),
    rule("read", "*.env.example", "allow"),
    rule("glob", "*", "allow"),
    rule("grep", "*", "allow"),
    rule("edit", "*", "deny"),
    ...(readOnly ? [] : allow.map((g) => rule("edit", editPattern(g), "allow"))),
    rule("shell", "*", "deny"),
    ...(readOnly
      ? []
      : [
          ...[...READ_GIT, ...bashAllow].map((c) => rule("shell", `${c} *`, "allow")),
          ...GIT_FLAGS_DENIED.map((f) => rule("shell", `git *${f}*`, "deny")),
        ]),
    ...DENIED_V2.map((a) => rule(a, "*", "deny")),
  ];
  return {
    agents: {
      "dispatch-worker": {
        mode: "primary",
        description: "Scoped non-interactive worker",
        permissions,
        ...(route.options ? { request: { body: route.options } } : {}),
      },
    },
  };
}

/** Files a completed edit tool changed: 2.x reports patch files in metadata, both report input paths. */
function editedFiles(st) {
  const files = (st.metadata?.metadata?.files ?? []).map((f) => f.movePath ?? f.file).filter(Boolean);
  if (files.length) {
    return files;
  }
  const direct = st.input?.filePath ?? st.input?.path;
  if (direct) {
    return [direct];
  }
  return [...String(st.input?.patchText ?? "").matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)].map(
    (m) => m[1].trim(),
  );
}

/** The models.dev catalog OpenCode 2 caches, for context windows. */
function catalog(bin) {
  const r = runSync(bin, ["debug", "paths"], { timeout: 20000 });
  const cache =
    r.status === 0
      ? r.stdout
          .toString()
          .match(/^cache\s+(.+)$/m)?.[1]
          ?.trim()
      : null;
  try {
    return cache ? JSON.parse(fs.readFileSync(path.join(cache, "models.json"), "utf8")) : {};
  } catch {
    return {};
  }
}

export default {
  name: "opencode",

  detect() {
    if (detected) {
      return detected;
    }
    const bin = resolveCommand("opencode", process.env.DELEGATE_WORK_BIN_OPENCODE);
    if (!bin) {
      return (detected = { ok: false, reason: "not installed (npm i -g opencode-ai)" });
    }
    const r = runSync(bin, ["--version"], { timeout: 20000 });
    if (r.status !== 0) {
      return (detected = { ok: false, reason: `failed to run: ${r.stderr?.toString().trim() || r.error?.message}` });
    }
    const version = r.stdout.toString().trim();
    const major = Number(version.match(/\d+/)?.[0] ?? 1);
    return (detected = { ok: true, bin, version, major });
  },

  command({ route, prompt, readOnly, allow, bashAllow, sessionId, cwd }) {
    const v2 = this.detect().major >= 2;
    const config = (v2 ? agentV2 : agentV1)({ route, readOnly, allow, bashAllow });
    // 2.x runs sessions in a shared background service that never sees this
    // process's environment (the injected config); --standalone starts a
    // private one, in the process cwd. 1.x takes the dir and variant as flags.
    const args = v2
      ? ["run", "--format", "json", "--standalone", "--print-logs", "--log-level", "error"]
      : ["run", "--format", "json", "--print-logs", "--log-level", "ERROR", "--dir", cwd];
    // --print-logs: 1.x error events only say "Unexpected server error"; the
    // real cause (model not found, auth, rate limit) is in the logs on stderr.
    args.push(
      "--agent",
      "dispatch-worker",
      "-m",
      v2 && route.variant ? `${route.model}#${route.variant}` : route.model,
    );
    if (!v2 && route.variant) {
      args.push("--variant", route.variant);
    }
    // Without a title, OpenCode spends an extra model request generating one.
    if (sessionId) {
      args.push("--session", sessionId);
    } else {
      args.push("--title", "dispatch-worker");
    }
    return {
      args,
      input: prompt,
      env: {
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        OPENCODE_DISABLE_AUTOUPDATE: "1",
        OPENCODE_DISABLE_SHARE: "1",
      },
    };
  },

  parseLine(line, acc) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      const plain = stripAnsi(line);
      const m = plain.match(/permission requested:\s*(.+?);\s*auto-rejecting/i);
      if (m) {
        acc.denied.push(m[1].trim());
      }
      return;
    }
    if (ev.sessionID) {
      acc.sessionId = ev.sessionID;
    }
    const part = ev.part ?? {};
    switch (ev.type) {
      case "step_start":
        acc.steps++;
        acc.stepTexts = [];
        break;
      case "text":
        if (part.text) {
          acc.stepTexts.push(part.text);
          acc.texts.push(part.text);
        }
        break;
      case "tool_use": {
        const st = part.state ?? {};
        if (EDIT_TOOLS.has(part.tool) && st.status === "completed") {
          acc.edits.push(...editedFiles(st));
        }
        if (st.status !== "error") {
          break;
        }
        const err = String(st.error ?? "");
        const what = () =>
          String(st.input?.command ?? (editedFiles(st).join(", ") || err.split(/[.\n]/)[0])).slice(0, 200);
        // 1.x: "...specified a rule which prevents you from using this specific
        // tool call" plus a dump of every rule; 2.x: "Permission denied: edit".
        // Keep the attempted action instead.
        if (/reject|denied|not allowed|prevents you from using/i.test(err)) {
          acc.denied.push(`${part.tool}: ${what()}`);
        }
        // 2.x: a permission that resolved to "ask" interrupts the tool, then the run.
        if (/tool execution interrupted/i.test(err)) {
          acc.interrupted = `${part.tool}: ${what()}`;
        }
        break;
      }
      case "error": {
        const e = ev.error ?? {};
        const msg = String(e.data?.message ?? e.message ?? e.name ?? "unknown error");
        const status = e.data?.statusCode ?? e.status;
        if (e.type === "aborted" && acc.interrupted) {
          acc.denied.push(
            `${acc.interrupted} (needs approval, which opencode run can't ask for; the run stopped there)`,
          );
          acc.stopped = true;
          break;
        }
        acc.errors.push(status ? `HTTP ${status}: ${msg}` : msg);
        break;
      }
    }
  },

  /**
   * Models available with the current logins, id → { context }. 1.x prints
   * models.dev metadata with `--verbose`; 2.x lists ids only, and the window
   * comes from the models.dev catalog it caches. The usable window is
   * limit.input, else limit.context.
   */
  models() {
    const d = this.detect();
    if (!d.ok) {
      return null;
    }
    const v2 = d.major >= 2;
    const r = runSync(d.bin, v2 ? ["models"] : ["models", "--verbose"], {
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) {
      return null;
    }
    const out = new Map();
    const text = r.stdout.toString().replace(/\r/g, "");
    if (v2) {
      const known = catalog(d.bin);
      for (const id of text.split("\n").filter((l) => /^\S+\/\S+$/.test(l))) {
        const [provider, ...rest] = id.split("/");
        const limit = known[provider]?.models?.[rest.join("/")]?.limit;
        out.set(id, { context: limit?.input ?? limit?.context ?? null });
      }
      // A service still starting can list nothing and exit 0; unknown beats "every id is missing".
      return out.size ? out : null;
    }
    for (const m of text.matchAll(/^(\S+\/\S+)\n(\{[\s\S]*?\n\})/gm)) {
      let limit = null;
      try {
        limit = JSON.parse(m[2]).limit;
      } catch {
        // Unparsable metadata: the context stays unknown.
      }
      out.set(m[1], { context: limit?.input ?? limit?.context ?? null });
    }
    return out;
  },

  finalText: (acc) => (acc.stepTexts.length ? acc.stepTexts : acc.texts.slice(-1)).join("\n"),

  classify({ code, acc, stderrTail }) {
    // A run stopped by a permission prompt is the worker's outcome, not a harness failure.
    if (!acc.errors.length && (code === 0 || acc.stopped)) {
      return { kind: "ok" };
    }
    const cause = [...(stderrTail ?? "").matchAll(/error="([^"]+)"/g)].map((m) => m[1]).at(-1);
    // Classify on the error that ended the run. The stderr tail also holds
    // errors OpenCode already retried past (e.g. a 429 before a final 503).
    const final = [cause, ...acc.errors].filter(Boolean).join("\n").trim();
    const message = [final, stderrTail].filter(Boolean).join("\n").trim();
    let c = classifyText(final);
    if (c.kind === "fatal") {
      c = classifyText(message);
    }
    return { ...c, message: message.slice(0, 500) };
  },
};
