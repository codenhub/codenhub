import fs from "node:fs";
import path from "node:path";

import { resolveCommand, runShell, runSync } from "./proc.mjs";

const WIN = process.platform === "win32";
const exists = (root, ...p) => fs.existsSync(path.join(root, ...p));
const read = (root, f) => {
  try {
    return fs.readFileSync(path.join(root, f), "utf8");
  } catch {
    return "";
  }
};

// ---------- Node ----------

function pm(root, pkg) {
  const declared = pkg.packageManager?.split("@")[0];
  if (declared) {
    return declared;
  }
  if (exists(root, "pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (exists(root, "yarn.lock")) {
    return "yarn";
  }
  if (exists(root, "bun.lock") || exists(root, "bun.lockb")) {
    return "bun";
  }
  return "npm";
}

const runScript = (m, s) => (m === "yarn" ? `yarn ${s}` : `${m} run ${s}`);
const execBin = (m, b) =>
  ({ pnpm: `pnpm exec ${b}`, yarn: `yarn ${b}`, bun: `bunx ${b}` })[m] ?? `npx --no-install ${b}`;

function node(root, level) {
  if (!exists(root, "package.json")) {
    return null;
  }
  let pkg;
  try {
    pkg = JSON.parse(read(root, "package.json"));
  } catch {
    // Unreadable or invalid: no Node checks, the other ecosystems still count.
    return null;
  }
  const s = pkg.scripts ?? {};
  const m = pm(root, pkg);
  const has = (n) => typeof s[n] === "string" && !/no test specified/.test(s[n]);
  const first = (...names) => names.find(has);
  const run = (n) => ({ name: n, cmd: runScript(m, n) });

  if (level === "full" && has("verify")) {
    return [run("verify")];
  }

  const out = [];
  const type = first("typecheck", "type-check", "types", "tsc");
  if (type) {
    out.push(run(type));
  } else if (exists(root, "tsconfig.json")) {
    out.push({ name: "typecheck", cmd: execBin(m, "tsc --noEmit") });
  }

  if (has("check")) {
    out.push(run("check"));
  } else {
    const lint = first("lint");
    const fmt = first("format:check", "fmt:check", "prettier:check", "format-check");
    if (lint) {
      out.push(run(lint));
    }
    if (fmt) {
      out.push(run(fmt));
    }
  }
  if (has("test")) {
    out.push(run("test"));
  }
  if (level === "full" && has("build")) {
    out.push(run("build"));
  }
  return out;
}

// ---------- Rust ----------

const cargoCan = new Map();
/** Whether `cargo <sub>` works here (clippy and rustfmt are optional rustup components). */
function cargoHas(sub) {
  if (!cargoCan.has(sub)) {
    const cargo = resolveCommand("cargo");
    cargoCan.set(
      sub,
      !!cargo && runSync(cargo, sub ? [sub, "--version"] : ["--version"], { timeout: 20000 }).status === 0,
    );
  }
  return cargoCan.get(sub);
}

function rust(root) {
  if (!exists(root, "Cargo.toml")) {
    return null;
  }
  if (!cargoHas("")) {
    return null;
  }
  const out = [];
  // Only when the project opts into a style: an unformatted codebase would
  // fail this regardless of the worker's change.
  if ((exists(root, "rustfmt.toml") || exists(root, ".rustfmt.toml")) && cargoHas("fmt")) {
    out.push({ name: "fmt", cmd: "cargo fmt --all --check" });
  }
  // Without -D warnings: existing warnings stay warnings; errors and deny lints fail.
  out.push(
    cargoHas("clippy")
      ? { name: "clippy", cmd: "cargo clippy --workspace --all-targets" }
      : { name: "check", cmd: "cargo check --workspace --all-targets" },
  );
  out.push({ name: "test", cmd: "cargo test --workspace" });
  return out;
}

// ---------- Python ----------

const PY_MARKERS = ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"];

/** The project's own virtualenv. Worktrees get it linked, so the relative path works in both. */
function venv(root) {
  for (const d of [".venv", "venv"]) {
    const py = WIN ? `${d}/Scripts/python.exe` : `${d}/bin/python`;
    if (!exists(root, py)) {
      continue;
    }
    let site = path.join(root, d, "Lib", "site-packages");
    if (!WIN) {
      const lib = path.join(root, d, "lib");
      const ver = (() => {
        try {
          return fs.readdirSync(lib).find((n) => n.startsWith("python3"));
        } catch {
          return null;
        }
      })();
      site = ver ? path.join(lib, ver, "site-packages") : "";
    }
    return { py, installed: (pkg) => !!site && fs.existsSync(path.join(site, pkg)) };
  }
  return null;
}

function python(root) {
  if (!PY_MARKERS.some((m) => exists(root, m))) {
    return null;
  }
  const env = venv(root);
  let py;
  if (env) {
    py = env.py;
  } else if (exists(root, "poetry.lock")) {
    py = "poetry run python";
  } else if (exists(root, "pdm.lock")) {
    py = "pdm run python";
  }
  // uv always creates .venv; without one, `uv run` would create it in the repo.
  else if (exists(root, "uv.lock")) {
    return null;
  } else {
    py = WIN ? "python" : "python3";
  }

  const pyproject = read(root, "pyproject.toml");
  const section = (name) => new RegExp(`^\\[tool\\.${name}[\\].]`, "m").test(pyproject);
  const iniHas = (file, header) => read(root, file).includes(header);
  // Configured tools only; with a venv, also installed (otherwise the check
  // fails for a reason the worker can't fix).
  const use = (pkg, configured) => configured && (!env || env.installed(pkg));

  const out = [];
  const mypyConfig = [pyproject, read(root, "mypy.ini"), read(root, ".mypy.ini"), read(root, "setup.cfg")].join("\n");
  if (
    use(
      "mypy",
      section("mypy") || exists(root, "mypy.ini") || exists(root, ".mypy.ini") || iniHas("setup.cfg", "[mypy"),
    )
  ) {
    // Without a configured `files`, bare mypy has nothing to check.
    out.push({ name: "mypy", cmd: `${py} -m mypy${/^files\s*=/m.test(mypyConfig) ? "" : " ."}` });
  }
  if (use("pyright", section("pyright") || exists(root, "pyrightconfig.json"))) {
    out.push({ name: "pyright", cmd: `${py} -m pyright` });
  }
  if (use("ruff", section("ruff") || exists(root, "ruff.toml") || exists(root, ".ruff.toml"))) {
    out.push({ name: "ruff", cmd: `${py} -m ruff check .` });
    if (section("ruff\\.format")) {
      out.push({ name: "ruff-format", cmd: `${py} -m ruff format --check .` });
    }
  }
  if (use("black", section("black"))) {
    out.push({ name: "black", cmd: `${py} -m black --check .` });
  }

  const pytestConfigured =
    section("pytest") ||
    exists(root, "pytest.ini") ||
    exists(root, "conftest.py") ||
    iniHas("setup.cfg", "[tool:pytest]") ||
    iniHas("tox.ini", "[pytest]");
  const testsDir = exists(root, "tests") || exists(root, "test");
  const deps = [
    pyproject,
    read(root, "setup.cfg"),
    read(root, "setup.py"),
    ...fs
      .readdirSync(root)
      .filter((f) => /^requirements.*\.txt$/.test(f))
      .map((f) => read(root, f)),
  ].join("\n");
  if (pytestConfigured || (testsDir && (/\bpytest\b/.test(deps) || env?.installed("pytest")))) {
    if (use("pytest", true)) {
      out.push({ name: "pytest", cmd: `${py} -m pytest` });
    }
  } else if (testsDir) {
    // Exits non-zero when it finds no tests (Python 3.12+).
    out.push({ name: "unittest", cmd: `${py} -m unittest discover` });
  }
  if (!out.length) {
    return null;
  }

  // src layout: the venv's editable install points at the repository, not a
  // worktree. PYTHONPATH comes before site-packages, so the tree under test wins.
  if (exists(root, "src")) {
    const pythonPath = ["src", process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    for (const c of out) {
      c.env = { PYTHONPATH: pythonPath };
    }
  }
  return out;
}

// Each returns an array of checks ({name, cmd, env?}) or null. A root with
// several ecosystems (a Tauri app, a Node package with a Rust core) gets all.
const DETECTORS = [node, rust, python];

export function resolveChecks(root, level, project) {
  if (level === "none") {
    return [];
  }
  const configured = project?.checks?.[level];
  if (Array.isArray(configured)) {
    return configured.map((cmd, i) => ({ name: `check${i + 1}`, cmd }));
  }
  return DETECTORS.flatMap((d) => d(root, level) ?? []);
}

/** Variables the checks need, for the worker that runs them too. */
export const checkEnv = (checks) => Object.assign({}, ...checks.map((c) => c.env ?? {}));

export async function runChecks(checks, cwd, timeoutMs, env) {
  const results = [];
  for (const c of checks) {
    // oxlint-disable-next-line no-await-in-loop -- checks share the tree and build outputs; they run in turn.
    const r = await runShell(c.cmd, { cwd, timeoutMs, env: { ...env, ...c.env } });
    const tail = r.ok ? "" : r.output.trim().split(/\r?\n/).slice(-20).join("\n");
    results.push({ name: c.name, ok: r.ok, tail: r.timedOut ? `timed out\n${tail}` : tail });
  }
  return results;
}
