import { TIERS } from "./config.mjs";
import { harnessModels, routeContext } from "./models.mjs";
import { cooldowns } from "./state.mjs";

export const nextTier = (t) => TIERS[Math.min(TIERS.indexOf(t) + 1, TIERS.length - 1)];

/** Quota pools the current orchestrator draws from (its own models should run natively). */
export function orchestratorPools(cfg, name) {
  const orch = cfg.orchestrators ?? {};
  if (name) {
    return orch[name]?.pools ?? [];
  }
  for (const o of Object.values(orch)) {
    if (o.env && process.env[o.env]) {
      return o.pools ?? [];
    }
  }
  return [];
}

/** Families of the models the orchestrator runs natively: what its own subagents would be. */
export function orchestratorFamilies(cfg, pools) {
  return [
    ...new Set(
      Object.values(cfg.models)
        .filter((m) => m.routes?.some((r) => pools.includes(r.quotaPool)))
        .map((m) => m.family),
    ),
  ];
}

/** The part of a model id that names its line: `gemini` in gemini-3.8-flash-high, `openai/gpt` in openai/gpt-6-sol. */
const modelLine = (id) => String(id).replace(/[-.:@\d][^/]*$/, "");

/**
 * A route for a model the config doesn't list, run as the harness names it.
 * Quota pool, data policy and secrets come from a configured route on the same
 * harness, preferring one of the same model line (which also gives the family),
 * then one of the same OpenCode provider.
 */
export function adhocRoute(cfg, harness, model) {
  const provider = (id) => (harness === "opencode" ? String(id).split("/")[0] : "");
  const onHarness = Object.values(cfg.models).flatMap((m) =>
    (m.routes ?? []).filter((r) => r.harness === harness).map((r) => ({ m, r })),
  );
  // An id that is all version (`4o`, `openrouter/4o`) names no line.
  const line = modelLine(model);
  const named = line && !line.endsWith("/");
  const sameLine = named ? onHarness.find((x) => modelLine(x.r.model) === line) : undefined;
  const base = (sameLine ?? onHarness.find((x) => provider(x.r.model) === provider(model)))?.r;
  return {
    family: sameLine?.m.family ?? "unknown",
    route: {
      id: "adhoc",
      harness,
      model,
      quotaPool: base?.quotaPool ?? harness,
      // No configured route says what this provider does with the data: assume the worst.
      trainsOnData: base ? (base.trainsOnData ?? false) : true,
      ...(base ? {} : { unknownPolicy: true }),
      ...(base?.passEnv ? { passEnv: base.passEnv } : {}),
      ...(base?.windowsSandbox ? { windowsSandbox: base.windowsSandbox } : {}),
    },
  };
}

/** The models to try, each with the routes the overrides leave. */
function shortlist(cfg, adapters, o, skipped) {
  const onHarness = (r) => !o.harness || r.harness === o.harness;
  if (o.model) {
    // Named by config id: that model, on every route; a config id is no
    // harness's model id, so with no route here there is nothing to run.
    const own = cfg.models[o.model];
    if (own) {
      const routes = (own.routes ?? []).filter(onHarness);
      if (own.routes?.length && !routes.length) {
        skipped.push({ modelId: o.model, reason: `no ${o.harness} route` });
        return [];
      }
      return [{ modelId: o.model, m: own, routes }];
    }
    // By a harness's model id: only the routes that run that id.
    const list = Object.entries(cfg.models)
      .map(([modelId, m]) => ({
        modelId,
        m,
        routes: (m.routes ?? []).filter((r) => onHarness(r) && r.model === o.model),
      }))
      .filter((x) => x.routes.length);
    if (list.length) {
      return list;
    }
    if (!o.harness) {
      skipped.push({
        modelId: o.model,
        reason: "no configured model or route model by that name; give --harness to run it as the harness names it",
      });
      return [];
    }
    const known = harnessModels(o.harness, adapters[o.harness]);
    if (known?.size && !known.has(o.model)) {
      skipped.push({ modelId: o.model, route: "adhoc", reason: `${o.harness} doesn't list this model` });
      return [];
    }
    const a = adhocRoute(cfg, o.harness, o.model);
    return [{ modelId: o.model, m: { family: a.family, context: 0 }, routes: [a.route] }];
  }
  // A kind's models go first; the tier's general ones stay as fallbacks.
  const ids = [...new Set([...(cfg.kinds?.[o.kind]?.[o.tier] ?? []), ...(cfg.tiers?.[o.tier] ?? [])])];
  return ids
    .filter((id) => cfg.models[id])
    .map((modelId) => {
      const m = cfg.models[modelId];
      const routes = (m.routes ?? []).filter(onHarness);
      if (m.routes?.length && !routes.length) {
        skipped.push({ modelId, reason: `no ${o.harness} route` });
      }
      return { modelId, m, routes, empty: !m.routes?.length };
    })
    .filter((x) => x.routes.length || x.empty);
}

/**
 * Ordered candidate routes for a task.
 * Returns { native } when the best viable choice belongs to the orchestrator's own pool,
 * otherwise { candidates: [...], skipped: [...] }.
 * A named harness or effort can't be given to a native subagent, so either means external.
 */
export function candidates(cfg, adapters, o) {
  const skipped = [];
  const cool = cooldowns();
  const external = o.external || !!o.harness || !!o.effort;
  const safety = cfg.limits?.contextSafety ?? 1.5;
  const needed = o.estimate * safety;
  const out = [];
  for (const { modelId, m, routes } of shortlist(cfg, adapters, o, skipped)) {
    if (o.excludeFamilies?.includes(m.family)) {
      skipped.push({ modelId, reason: `same family as reviewed work (${m.family})` });
      continue;
    }
    if (!routes.length) {
      skipped.push({ modelId, reason: "no routes configured" });
      continue;
    }
    for (const r of routes) {
      const tag = { modelId, route: r.id };
      if (r.enabled === false) {
        // Named on purpose, a disabled route says why nothing ran.
        if (o.model) {
          skipped.push({ ...tag, reason: "disabled in config" });
        }
        continue;
      }
      if (r.trainsOnData && !cfg.allowTraining) {
        skipped.push({
          ...tag,
          reason: r.unknownPolicy
            ? "data policy: unknown for this provider; configure a route for it, or allow training"
            : "data policy: route may train on data",
        });
        continue;
      }
      // Only reads the metadata cache when a size check can matter.
      const ctx =
        needed > 0 ? routeContext(m, r, harnessModels(r.harness, adapters[r.harness])?.get(r.model)?.context) : 0;
      if (ctx > 0 && needed > ctx) {
        skipped.push({
          ...tag,
          reason: `context: needs ~${Math.round(needed / 1000)}k (~${Math.round(o.estimate / 1000)}k × ${safety} safety), has ${Math.round(ctx / 1000)}k`,
        });
        continue;
      }
      // A pool cooling down is out for native subagents too: they draw on the same quota.
      if (cool[r.quotaPool]) {
        const mins = Math.ceil((cool[r.quotaPool].until - Date.now()) / 60000);
        skipped.push({ ...tag, reason: `cooling down (${cool[r.quotaPool].reason}, ~${mins} min)` });
        continue;
      }
      if (!external && o.pools.includes(r.quotaPool)) {
        if (!out.length) {
          return { native: { modelId, model: r.model, family: m.family } };
        }
        skipped.push({ ...tag, reason: "orchestrator quota pool; use native subagents" });
        continue;
      }
      const a = adapters[r.harness];
      const avail = a?.detect();
      if (!avail?.ok) {
        skipped.push({ ...tag, reason: `${r.harness}: ${avail?.reason ?? "unknown harness"}` });
        continue;
      }
      let route = r;
      if (o.effort) {
        const e = a.withEffort?.(r, o.effort) ?? { route: { ...r, variant: o.effort } };
        if (!e.route) {
          skipped.push({ ...tag, reason: e.reason });
          continue;
        }
        route = e.route;
      }
      out.push({ modelId, family: m.family, route, adapter: a });
    }
  }
  return { candidates: out, skipped };
}
