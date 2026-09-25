import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

const WIN = process.platform === "win32";

/** Find an executable on PATH. On Windows, npm-installed CLIs are .cmd shims. */
export function resolveCommand(name, override) {
  if (override) {
    return { file: override, shim: WIN && /\.(cmd|bat)$/i.test(override) };
  }
  const exts = WIN ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase()) : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    for (const ext of exts) {
      const file = path.join(dir, name + ext);
      try {
        if (fs.statSync(file).isFile()) {
          return { file, shim: WIN && /\.(cmd|bat)$/i.test(file) };
        }
      } catch {
        // Not in this directory.
      }
    }
  }
  return null;
}

// Arguments we pass are model ids, paths and flags we control. Prompts go
// through stdin, so nothing user-written ever reaches cmd.exe parsing.
const UNSAFE = /["%!^&|<>\r\n]/;
function quoteForCmd(a) {
  if (UNSAFE.test(a)) {
    throw new Error(`refusing unsafe argument for cmd shim: ${a}`);
  }
  return /[\s]/.test(a) ? `"${a}"` : a;
}

// A .cmd shim needs cmd.exe. Node deprecates args + shell (DEP0190), so the
// command line is built here from vetted arguments instead.
const shimLine = (file, args) => [file, ...args].map(quoteForCmd).join(" ");

/** spawnSync for a resolveCommand() result. */
export function runSync(resolved, args, opts = {}) {
  return resolved.shim
    ? spawnSync(shimLine(resolved.file, args), { windowsHide: true, ...opts, shell: true })
    : spawnSync(resolved.file, args, { windowsHide: true, ...opts });
}

/** process.env plus overrides; an override of null removes the variable. */
export function mergeEnv(env = {}) {
  const out = { ...process.env, ...env };
  for (const [k, v] of Object.entries(out)) {
    if (v === null || v === undefined) {
      delete out[k];
    }
  }
  return out;
}

export function killTree(pid) {
  if (!pid) {
    return;
  }
  try {
    if (WIN) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Already gone.
  }
}

/**
 * Run a process, stream stdout lines to onLine, enforce a timeout that kills
 * the whole tree. Returns a handle with .done (promise) and .kill(reason).
 */
export function start(cmd, args, { cwd, env, input, timeoutMs, onLine, stdoutFile, stderrFile } = {}) {
  const resolved = typeof cmd === "string" ? { file: cmd, shim: false } : cmd;
  const opts = {
    cwd,
    env: mergeEnv(env),
    stdio: ["pipe", "pipe", "pipe"],
    detached: !WIN,
    windowsHide: true,
  };
  let child;
  if (resolved.shim) {
    child = spawn(shimLine(resolved.file, args), { ...opts, shell: true });
  } else {
    child = spawn(resolved.file, args, opts);
  }

  let killedFor = null;
  const out = stdoutFile ? fs.createWriteStream(stdoutFile) : null;
  const err = stderrFile ? fs.createWriteStream(stderrFile) : null;
  let stderrTail = "";
  let buf = "";
  // A multibyte character can straddle two chunks; decoders carry the partial bytes over.
  const outText = new StringDecoder("utf8");
  const errText = new StringDecoder("utf8");

  child.stdout.on("data", (d) => {
    out?.write(d);
    buf += outText.write(d);
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line && onLine) {
        onLine(line);
      }
    }
  });
  child.stderr.on("data", (d) => {
    err?.write(d);
    stderrTail = (stderrTail + errText.write(d)).slice(-8000);
  });
  child.stdin.on("error", () => {
    // EPIPE when the harness exits before reading the whole prompt (an auth
    // failure, say); the close handler reports the outcome.
  });
  if (input !== null && input !== undefined) {
    child.stdin.end(input);
  } else {
    child.stdin.end();
  }

  const kill = (reason) => {
    if (killedFor) {
      return;
    }
    killedFor = reason;
    killTree(child.pid);
  };
  const timer = timeoutMs ? setTimeout(() => kill("timeout"), timeoutMs) : null;

  const done = new Promise((resolve) => {
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, killedFor, stderrTail: stderrTail + String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      buf += outText.end();
      stderrTail = (stderrTail + errText.end()).slice(-8000);
      if (buf && onLine) {
        onLine(buf);
      }
      out?.end();
      err?.end();
      resolve({ code, killedFor, stderrTail });
    });
  });
  return { done, kill, pid: child.pid };
}

/** Run a shell command (project check scripts). Returns ok + output tail. */
export async function runShell(command, { cwd, timeoutMs, env }) {
  // cmd.exe reads `/` in an unquoted program path as a switch
  // (`.venv/Scripts/python.exe` → "'.venv' is not recognized"). Commands are
  // written with `/` because workers run them in bash or PowerShell.
  if (WIN) {
    command = command.replace(/^[^\s"]*\/[^\s"]*/, (p) => p.replaceAll("/", "\\"));
  }
  const child = spawn(command, {
    cwd,
    shell: true,
    // FORCE_COLOR=0 disables color for Node tools but forces it for Python,
    // which checks NO_COLOR first.
    env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1", ...env },
    detached: !WIN,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const collect = (stream) => {
    const text = new StringDecoder("utf8");
    stream.on("data", (d) => (output = (output + text.write(d)).slice(-20000)));
    stream.on("end", () => (output += text.end()));
  };
  collect(child.stdout);
  collect(child.stderr);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killTree(child.pid);
  }, timeoutMs);
  const code = await new Promise((r) => {
    child.on("error", () => r(-1));
    child.on("close", r);
  });
  clearTimeout(timer);
  // Wrapper scripts may leave background processes behind; clean them up.
  killTree(child.pid);
  return { ok: code === 0 && !timedOut, timedOut, output };
}
