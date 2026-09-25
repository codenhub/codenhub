#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { adapters, harnessNames } from "../adapters/index.mjs";
import { defaultPath, load, TIERS, userPath, validate } from "./lib/config.mjs";
import { git, gitProblem, repoRoot } from "./lib/git.mjs";
import { harnessModels, routeContext } from "./lib/models.mjs";
import { parseAge, prune } from "./lib/prune.mjs";
import { candidates, orchestratorPools } from "./lib/route.mjs";
import * as R from "./lib/runner.mjs";
import { cooldowns } from "./lib/state.mjs";

const HELP = `dispatch — delegate scoped tasks to worker agents

  run       --role <scout|fixer|builder|reviewer> --brief <file|->
            [--allow <glob>]... [--read <glob>]... [--tier light|standard|strong]
            [--kind code|ui|text] [--model <id>] [--external]
            [--isolation auto|inplace|worktree] [--orchestrator <name>]
            [--rebrief-of <id>] [--review <id>]
  run       --batch <file.json>     tasks: [{ role, allow, read, tier, kind, brief | briefFile }]
  followup  <id> --brief <file|->   one follow-up in the same worker session
  apply     <id>                    keep the change (worktree: apply the patch)
  discard   <id>                    drop the change
  unapply   <id>                    revert an applied change
  diff      <id>                    print the change as a patch
  prune     [--older-than <age>] [--all] [--dry-run]
                                    remove run state older than <age> (90m, 24h, 7d;
                                    default limits.pruneAfterHours): worktrees, logs,
                                    unapplied results. --all: every run not running
  doctor                            check config, harnesses, models, tiers
  init                              create the user config if missing
  config    --path                  print config file locations

Output: one JSON document on stdout. Exit 0 = result produced (read "status"),
1 = bad invocation, 2 = dispatch itself failed.`;

function parse(argv) {
  const [cmd, ...rest] = argv;
  const o = { cmd, pos: [], allow: [], read: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) {
      o.pos.push(a);
      continue;
    }
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (["external", "path", "help", "all", "dryRun"].includes(key)) {
      o[key] = true;
      continue;
    }
    const val = rest[++i];
    if (val === undefined) {
      throw new R.UsageError(`${a} needs a value`);
    }
    if (key === "allow" || key === "read") {
      o[key].push(val);
    } else {
      o[key] = val;
    }
  }
  return o;
}

const readBrief = (src) => {
  if (!src) {
    return undefined;
  }
  if (src === "-") {
    return fs.readFileSync(0, "utf8");
  }
  if (!fs.existsSync(src)) {
    throw new R.UsageError(`brief file not found: ${src}`);
  }
  return fs.readFileSync(src, "utf8");
};

const out = (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);

/** Undecided results and stale state, so leftovers from earlier sessions surface. */
function runSummary(cfg) {
  const pending = prune({ maxAgeMs: Infinity, dryRun: true }).kept.filter((k) => k.reason !== "running");
  const prunable = prune({ maxAgeMs: (cfg.limits?.pruneAfterHours ?? 24) * 3600000, dryRun: true }).removed.length;
  return {
    pending: pending.map(
      (k) => `${k.id} (${k.role}, ${k.status}, ${k.ageHours}h): ${k.reason.replace(/^recent; /, "")}`,
    ),
    prunable,
    hint: prunable ? "Run `dispatch prune` to remove old run state." : null,
  };
}

function doctor(cwd) {
  let root = null;
  try {
    root = repoRoot(cwd);
  } catch {
    // Not in a repository: doctor reports it below.
  }
  let cfg,
    errors = [];
  try {
    cfg = load(root);
    errors = validate(cfg, harnessNames);
  } catch (e) {
    return { config: { default: defaultPath(), user: userPath(), errors: [e.message] } };
  }
  const gitVersion = { version: git(["--version"], { allowFail: true }).stdout || null, problem: gitProblem() };
  const config = { default: defaultPath(), user: userPath(), userExists: fs.existsSync(userPath()), errors };
  // Everything below walks models, routes and tiers as the schema says they are.
  if (errors.length) {
    const harnesses = Object.fromEntries(
      Object.entries(adapters).map(([n, a]) => {
        const d = a.detect();
        return [n, d.ok ? { ok: true, version: d.version } : { ok: false, reason: d.reason }];
      }),
    );
    return { config, repo: root, git: gitVersion, harnesses, hint: "Fix the config errors to see routes and tiers." };
  }
  const harnesses = Object.fromEntries(
    Object.entries(adapters).map(([n, a]) => {
      const d = a.detect();
      if (!d.ok) {
        return [n, { ok: false, reason: d.reason }];
      }
      const route = Object.values(cfg.models)
        .flatMap((m) => m.routes ?? [])
        .find((r) => r.harness === n && r.enabled !== false);
      const notes = a.probe?.(route) ?? [];
      return [n, { ok: true, version: d.version, ...(notes.length ? { notes } : {}) }];
    }),
  );
  const pools = orchestratorPools(cfg);
  const listed = {};
  const routes = [];
  const k = (n) => (n > 0 ? `${Math.round(n / 1000)}k` : null);
  for (const [modelId, m] of Object.entries(cfg.models)) {
    for (const r of m.routes ?? []) {
      if (r.enabled === false) {
        continue;
      }
      if (!(r.harness in listed)) {
        listed[r.harness] = harnessModels(r.harness, adapters[r.harness], { refresh: true });
      }
      const known = listed[r.harness];
      const reported = known?.get(r.model)?.context ?? null;
      const configured = [m.context, r.context].filter((n) => n > 0);
      const context = {
        configured: k(configured.length ? Math.min(...configured) : 0),
        reported: k(reported),
        effective: k(routeContext(m, r, reported)),
      };
      // Drift either way: a stale config can hide a smaller harness window or waste a larger one.
      if (configured.length && reported && Math.abs(Math.min(...configured) - reported) / reported > 0.1) {
        context.drift = `configured ${context.configured}, ${r.harness} reports ${context.reported}; routing uses ${context.effective}`;
      }
      routes.push({
        model: modelId,
        route: r.id,
        harness: r.harness,
        found: known ? known.has(r.model) : "unknown",
        context,
      });
    }
  }
  const missing = new Set(routes.filter((r) => r.found === false).map((r) => `${r.model} via ${r.route}`));
  const tiers = {};
  for (const t of TIERS) {
    const c = candidates(cfg, adapters, { tier: t, kind: "code", estimate: 0, pools, external: false });
    tiers[t] = c.native
      ? { native: c.native.model }
      : {
          usable: c.candidates
            .map((x) => `${x.modelId} via ${x.route.id}`)
            .map((s) => (missing.has(s) ? `${s} (model id not found; will fail)` : s)),
          skipped: c.skipped,
        };
  }
  return {
    config,
    repo: root,
    git: gitVersion,
    harnesses,
    orchestratorPools: pools,
    dataPolicy: { allowTraining: cfg.allowTraining },
    tiers,
    routes,
    cooldowns: cooldowns(),
    runs: runSummary(cfg),
  };
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (
    process.env.DELEGATE_WORK_WORKER &&
    ["run", "followup", "apply", "discard", "unapply", "prune"].includes(o.cmd)
  ) {
    throw new R.UsageError("running inside a dispatched worker; workers do not delegate or manage runs");
  }
  const cwd = process.cwd();
  if (!o.cmd || o.help || o.cmd === "help" || o.cmd === "--help") {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  switch (o.cmd) {
    case "run": {
      if (o.batch) {
        const spec = JSON.parse(fs.readFileSync(o.batch, "utf8"));
        const tasks = (spec.tasks ?? spec).map((t) => ({
          role: t.role,
          allow: t.allow ?? [],
          read: t.read ?? [],
          tier: t.tier,
          kind: t.kind,
          brief: t.brief ?? readBrief(t.briefFile),
        }));
        out(await R.batch(tasks, { cwd, orchestrator: o.orchestrator, external: o.external }));
        return 0;
      }
      out(
        await R.run({
          cwd,
          role: o.role,
          allow: o.allow,
          read: o.read,
          brief: readBrief(o.brief),
          tier: o.tier,
          kind: o.kind,
          model: o.model,
          external: o.external,
          isolation: o.isolation,
          orchestrator: o.orchestrator,
          rebriefOf: o.rebriefOf,
          review: o.review,
        }),
      );
      return 0;
    }
    case "followup":
      out(await R.followup(o.pos[0], readBrief(o.brief)));
      return 0;
    case "apply":
      out(R.apply(o.pos[0]));
      return 0;
    case "discard":
      out(await R.discard(o.pos[0]));
      return 0;
    case "unapply":
      out(R.unapply(o.pos[0]));
      return 0;
    case "diff":
      process.stdout.write(R.diff(o.pos[0]));
      return 0;
    case "prune": {
      const hours = load(null).limits?.pruneAfterHours ?? 24;
      const maxAgeMs = o.all ? 0 : o.olderThan !== undefined ? parseAge(o.olderThan) : hours * 3600000;
      if (maxAgeMs === null) {
        throw new R.UsageError("--older-than takes 90m, 24h, 7d or 0");
      }
      out(prune({ maxAgeMs, dryRun: !!o.dryRun }));
      return 0;
    }
    case "doctor":
      out(doctor(cwd));
      return 0;
    case "init": {
      const p = userPath();
      if (!fs.existsSync(p)) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.copyFileSync(defaultPath(), p);
        out({ created: p, next: "Edit models and tiers, then run `dispatch doctor`." });
      } else {
        out({ exists: p });
      }
      return 0;
    }
    case "config":
      out({ default: defaultPath(), user: userPath(), userExists: fs.existsSync(userPath()) });
      return 0;
    default:
      throw new R.UsageError(`unknown command "${o.cmd}"; run with --help`);
  }
}

try {
  process.exit(await main());
} catch (e) {
  if (e instanceof R.UsageError) {
    process.stderr.write(`dispatch: ${e.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`dispatch: internal error: ${e.stack ?? e}\n`);
  process.exit(2);
}
