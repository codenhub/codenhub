import { resolveCommand, runSync } from "../scripts/lib/proc.mjs";
import { classifyText, stripAnsi } from "./common.mjs";

const EDIT_TOOLS = new Set(["edit", "write", "patch", "multiedit", "apply_patch"]);
let detected;

// Edit permission patterns are paths relative to the worktree; on Windows they
// may use backslashes. OpenCode's "*" matches across separators.
const editPattern = (glob) => glob.replace(/\*\*\/?/g, "*");
const bothSlashes = (p) => [...new Set([p, p.replace(/\//g, "\\")])];

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
    detected =
      r.status === 0
        ? { ok: true, bin, version: r.stdout.toString().trim() }
        : { ok: false, reason: `failed to run: ${r.stderr?.toString().trim() || r.error?.message}` };
    return detected;
  },

  command({ route, cwd, prompt, readOnly, allow, bashAllow, sessionId }) {
    const bash = { "*": "deny" };
    for (const c of ["git status*", "git diff*", "git log*", "git show*"]) {
      bash[c] = "allow";
    }
    for (const c of bashAllow) {
      bash[c] = "allow";
      bash[`${c} *`] = "allow";
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

    const agent = {
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
    };

    // --print-logs: the JSON error events only say "Unexpected server error";
    // the real cause (model not found, auth, rate limit) is in the logs on stderr.
    const args = [
      "run",
      "--format",
      "json",
      "--print-logs",
      "--log-level",
      "ERROR",
      "--agent",
      "dispatch-worker",
      "-m",
      route.model,
      "--dir",
      cwd,
    ];
    if (route.variant) {
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
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ agent: { "dispatch-worker": agent } }),
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
        const file = st.input?.filePath ?? st.input?.path;
        if (EDIT_TOOLS.has(part.tool) && st.status === "completed" && file) {
          acc.edits.push(file);
        }
        // A configured "deny" reads "...specified a rule which prevents you from
        // using this specific tool call" followed by a dump of every rule; keep
        // the attempted action instead.
        if (
          st.status === "error" &&
          /reject|denied|not allowed|prevents you from using/i.test(String(st.error ?? ""))
        ) {
          const what = st.input?.command ?? file ?? String(st.error).split(/[.\n]/)[0];
          acc.denied.push(`${part.tool}: ${String(what).slice(0, 200)}`);
        }
        break;
      }
      case "error": {
        const e = ev.error ?? {};
        const msg = String(e.data?.message ?? e.message ?? e.name ?? "unknown error");
        acc.errors.push(e.data?.statusCode ? `HTTP ${e.data.statusCode}: ${msg}` : msg);
        break;
      }
    }
  },

  /**
   * Models available with the current logins. `--verbose` prints each id
   * followed by its models.dev metadata; the usable window is limit.input,
   * else limit.context.
   */
  models() {
    const d = this.detect();
    if (!d.ok) {
      return null;
    }
    const r = runSync(d.bin, ["models", "--verbose"], { timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) {
      return null;
    }
    const out = new Map();
    const text = r.stdout.toString().replace(/\r/g, "");
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
    if (!acc.errors.length && code === 0) {
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
