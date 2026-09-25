import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonical, canonicalGlob, globToRegex, toPosix } from "./glob.mjs";

export const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const defaultPath = () => path.join(skillDir, "config", "workers.json");

/** The home dir on every OS: AppData is redirected for packaged Windows apps (see state.mjs). */
export function userPath() {
  if (process.env.DELEGATE_WORK_CONFIG) {
    return process.env.DELEGATE_WORK_CONFIG;
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "delegate-work", "workers.json");
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

function merge(a, b) {
  if (!isObj(a) || !isObj(b)) {
    return b === undefined ? a : b;
  }
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = merge(a[k], v);
  }
  return out;
}

function read(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file}: invalid JSON (${e.message})`);
  }
}

export const ROLES = ["scout", "fixer", "builder", "reviewer"];
export const TIERS = ["light", "standard", "strong"];
export const KINDS = ["code", "ui", "text"];

/** Merge defaults + user config. Models and projects are replaced per key, not deep-merged. */
export function load(root) {
  const base = read(defaultPath()) ?? {};
  const user = read(userPath()) ?? {};
  const cfg = merge(base, { ...user, models: undefined, projects: undefined, tiers: undefined });
  cfg.models = { ...base.models, ...user.models };
  cfg.tiers = { ...base.tiers, ...user.tiers };
  cfg.projects = { ...base.projects, ...user.projects };
  cfg.project = {};
  if (root) {
    const forms = [...new Set([root, canonical(root)])].map(toPosix).flatMap((r) => [r, `${r}/`]);
    for (const [pattern, p] of Object.entries(cfg.projects)) {
      const re = globToRegex(canonicalGlob(pattern));
      if (forms.some((f) => re.test(f))) {
        cfg.project = merge(cfg.project, p);
      }
    }
  }
  cfg.allowTraining = cfg.project.allowTraining ?? cfg.dataPolicy?.allowTraining ?? false;
  return cfg;
}

export function validate(cfg, harnesses) {
  const errors = [];
  const e = (p, m) => errors.push(`${p}: ${m}`);
  for (const [id, m] of Object.entries(cfg.models ?? {})) {
    if (!isObj(m)) {
      e(`models.${id}`, "must be an object");
      continue;
    }
    if (typeof m.family !== "string") {
      e(`models.${id}.family`, "required string");
    }
    if (typeof m.context !== "number") {
      e(`models.${id}.context`, "required number (0 = unknown)");
    }
    if (!Array.isArray(m.routes)) {
      e(`models.${id}.routes`, "required array");
      continue;
    }
    m.routes.forEach((r, i) => {
      const p = `models.${id}.routes[${i}]`;
      if (!r.id) {
        e(p, "id required");
      }
      if (!harnesses.includes(r.harness)) {
        e(`${p}.harness`, `unknown harness "${r.harness}" (known: ${harnesses.join(", ")})`);
      }
      if (!r.model) {
        e(`${p}.model`, "required");
      }
      if (!r.quotaPool) {
        e(`${p}.quotaPool`, "required");
      }
      if (r.context !== undefined && typeof r.context !== "number") {
        e(`${p}.context`, "must be a number");
      }
    });
  }
  for (const [tier, list] of Object.entries(cfg.tiers ?? {})) {
    if (!TIERS.includes(tier)) {
      e(`tiers.${tier}`, `unknown tier (use ${TIERS.join(", ")})`);
    }
    for (const id of list ?? []) {
      if (!cfg.models?.[id]) {
        e(`tiers.${tier}`, `unknown model "${id}"`);
      }
    }
  }
  for (const [kind, tiers] of Object.entries(cfg.kinds ?? {})) {
    if (!KINDS.includes(kind)) {
      e(`kinds.${kind}`, `unknown kind (use ${KINDS.join(", ")})`);
    }
    for (const [tier, list] of Object.entries(tiers ?? {})) {
      for (const id of list ?? []) {
        if (!cfg.models?.[id]) {
          e(`kinds.${kind}.${tier}`, `unknown model "${id}"`);
        }
      }
    }
  }
  for (const [role, r] of Object.entries(cfg.roles ?? {})) {
    if (!ROLES.includes(role)) {
      e(`roles.${role}`, "unknown role");
    }
    if (r?.tier && !TIERS.includes(r.tier)) {
      e(`roles.${role}.tier`, "unknown tier");
    }
  }
  return errors;
}
