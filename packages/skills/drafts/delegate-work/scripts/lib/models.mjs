import fs from "node:fs";
import path from "node:path";

import { baseDir } from "./state.mjs";

// What each harness reports about its models (id → { context }), cached in
// the state dir so a run doesn't pay for `opencode models --verbose`. doctor
// always refreshes it.

const TTL_MS = 24 * 3600000;
const file = () => path.join(baseDir(), "harness-models.json");
const memo = new Map();

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Map of model id → { context } for a harness, or null when the harness can't
 * list its models. context is the usable input window, or null if unknown.
 */
export function harnessModels(name, adapter, { refresh = false } = {}) {
  if (!refresh && memo.has(name)) {
    return memo.get(name);
  }
  // An unusable harness isn't cached: it may be installed or logged in soon.
  if (!adapter?.detect().ok || !adapter.models) {
    return null;
  }
  const all = readAll();
  let entry = all[name];
  if (refresh || !entry || Date.now() - entry.at > TTL_MS) {
    const listed = adapter.models();
    entry = { at: Date.now(), models: listed ? Object.fromEntries(listed) : null };
    all[name] = entry;
    try {
      fs.writeFileSync(file(), JSON.stringify(all));
    } catch {
      // The cache is an optimization; the next run asks the harness again.
    }
  }
  const map = entry.models ? new Map(Object.entries(entry.models)) : null;
  memo.set(name, map);
  return map;
}

/**
 * The context a route can actually use: the smallest of the model's configured
 * context, the route's own `context`, and what the harness reports. 0 = unknown.
 */
export function routeContext(model, route, reported) {
  const limits = [model.context, route.context, reported].filter((n) => typeof n === "number" && n > 0);
  return limits.length ? Math.min(...limits) : 0;
}
