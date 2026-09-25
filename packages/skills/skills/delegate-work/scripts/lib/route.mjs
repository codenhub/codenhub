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

/**
 * Ordered candidate routes for a task.
 * Returns { native } when the best viable choice belongs to the orchestrator's own pool,
 * otherwise { candidates: [...], skipped: [...] }.
 */
export function candidates(cfg, adapters, o) {
  const skipped = [];
  const cool = cooldowns();
  let ids;
  if (o.model) {
    ids = Object.keys(cfg.models).filter(
      (id) => id === o.model || cfg.models[id].routes?.some((r) => r.model === o.model),
    );
  } else {
    ids = cfg.kinds?.[o.kind]?.[o.tier] ?? cfg.tiers?.[o.tier] ?? [];
  }
  const safety = cfg.limits?.contextSafety ?? 1.5;
  const needed = o.estimate * safety;
  const out = [];
  for (const modelId of ids) {
    const m = cfg.models[modelId];
    if (!m) {
      continue;
    }
    if (o.excludeFamilies?.includes(m.family)) {
      skipped.push({ modelId, reason: `same family as reviewed work (${m.family})` });
      continue;
    }
    if (!m.routes?.length) {
      skipped.push({ modelId, reason: "no routes configured" });
      continue;
    }
    for (const r of m.routes) {
      const tag = { modelId, route: r.id };
      if (r.enabled === false) {
        continue;
      }
      if (r.trainsOnData && !cfg.allowTraining) {
        skipped.push({ ...tag, reason: "data policy: route may train on data" });
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
      if (!o.external && o.pools.includes(r.quotaPool)) {
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
      if (cool[r.quotaPool]) {
        const mins = Math.ceil((cool[r.quotaPool].until - Date.now()) / 60000);
        skipped.push({ ...tag, reason: `cooling down (${cool[r.quotaPool].reason}, ~${mins} min)` });
        continue;
      }
      out.push({ modelId, family: m.family, route: r, adapter: a });
    }
  }
  return { candidates: out, skipped };
}
