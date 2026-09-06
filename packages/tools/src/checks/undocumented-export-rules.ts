import { glob, readFile } from "node:fs/promises";
import { posix } from "node:path";

import ts from "typescript";

import { emitDeclarations, resolveEntrypoints, type EntrypointPlan } from "../documentation/reference-declarations.ts";
import {
  buildDeclarationResolver,
  collectModuleGraph,
  resolveDtsCandidates,
} from "../documentation/reference-signatures.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { isDocumentedPackage } from "../workspace/package-policy.ts";
import type { CheckRule, Finding } from "./rule.ts";

interface TypedEntrypoint extends EntrypointPlan {
  target: string;
}

function unresolved(message: string, location: string): Finding {
  return { code: "undocumented-export/unresolved-export", severity: "warning", message, location };
}

function typeTargets(entry: unknown): string[] {
  if (typeof entry === "string") {
    return /\.d\.m?ts$/.test(entry) ? [entry] : [];
  }
  if (entry === null || typeof entry !== "object") {
    return [];
  }
  const conditions = entry as Record<string, unknown>;
  if (typeof conditions.types === "string") {
    return [conditions.types];
  }
  return Object.values(conditions).flatMap(typeTargets);
}

async function resolveTypedEntrypoints(workspacePackage: WorkspacePackage): Promise<TypedEntrypoint[]> {
  const exported = workspacePackage.manifest.exports;
  if (exported === null || exported === undefined) {
    return [];
  }
  const exportsMap =
    typeof exported === "object" && Object.keys(exported).some((key) => key.startsWith("."))
      ? exported
      : { ".": exported };
  const groups = await Promise.all(
    Object.entries(exportsMap).map(async ([subpath, entry]) => {
      if (subpath === "./package.json") {
        return [];
      }
      const targets = await Promise.all(
        [...new Set(typeTargets(entry))].map(async (target) => {
          const [plan] = resolveEntrypoints({ [subpath]: { types: target } }, { prose: false });
          if (plan === undefined) {
            return [];
          }
          if (!target.includes("*")) {
            return [{ ...plan, target: posix.normalize(target) }];
          }
          const disk = await Array.fromAsync(glob(target, { cwd: workspacePackage.directory }));
          const sources = await Array.fromAsync(glob(`src/${plan.sourceRel}`, { cwd: workspacePackage.directory }));
          const matches = new Set([
            ...disk.map((path) => path.replaceAll("\\", "/")),
            ...sources.map(
              (path) =>
                `dist/${path
                  .replaceAll("\\", "/")
                  .slice(4)
                  .replace(/\.m?ts$/, plan.entryDts.endsWith(".d.mts") ? ".d.mts" : ".d.ts")}`,
            ),
          ]);
          const pattern = posix.normalize(target);
          const star = pattern.indexOf("*");
          return matches.size === 0
            ? [{ ...plan, target: pattern }]
            : [...matches].sort().map((match) => {
                const replacement = match.slice(star, match.length - (pattern.length - star - 1));
                return {
                  entryDts: plan.entryDts.replaceAll("*", replacement),
                  module: plan.module.replaceAll("*", replacement),
                  sourceRel: plan.sourceRel.replaceAll("*", replacement),
                  subpath: subpath.replaceAll("*", replacement),
                  target: match,
                };
              });
        }),
      );
      return targets.flat();
    }),
  );
  return groups.flat();
}

async function readDeclarationGraph(directory: string, plans: readonly TypedEntrypoint[]) {
  const files = new Map<string, string>();
  const visited = new Set<string>();
  const missing = new Map<string, readonly string[]>();
  const visit = async (candidates: readonly string[]): Promise<void> => {
    const available = await Promise.all(
      candidates.map(async (path) => ({
        path,
        text: await readFile(`${directory}/${path}`, "utf8").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT" || error.code === "ENOTDIR") {
            return undefined;
          }
          throw error;
        }),
      })),
    );
    const found = available.find(({ text }) => text !== undefined);
    if (found?.text === undefined) {
      missing.set(candidates[0] ?? "package.json", candidates);
      return;
    }
    if (visited.has(found.path)) {
      return;
    }
    visited.add(found.path);
    files.set(found.path, found.text);
    const source = ts.createSourceFile(found.path, found.text, ts.ScriptTarget.Latest, true);
    const graph = collectModuleGraph(source);
    const modules = new Set([
      ...graph.reexports.map((edge) => edge.module),
      ...[...graph.imports.values()].map((binding) => binding.module),
    ]);
    await Promise.all(
      [...modules]
        .filter((module) => module.startsWith("."))
        .map((module) => visit(resolveDtsCandidates(found.path, module))),
    );
  };
  await Promise.all(plans.map((plan) => visit([plan.target])));
  return { files, missing };
}

async function run(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  const plans = await resolveTypedEntrypoints(workspacePackage);
  if (plans.length === 0) {
    return [];
  }
  const directory = workspacePackage.directory.replaceAll("\\", "/");
  const { files, missing } = await readDeclarationGraph(directory, plans);
  const findings: Finding[] = [];
  if (missing.size > 0) {
    const emitted = emitDeclarations(
      directory,
      plans.filter((plan) => !plan.sourceRel.includes("*")),
    );
    for (const [path, contents] of emitted) {
      files.set(`dist/${path}`, contents);
    }
  }
  const resolver = buildDeclarationResolver(files);
  for (const plan of plans) {
    if (!files.has(plan.target)) {
      findings.push(
        unresolved(
          `Cannot resolve declarations for export "${plan.subpath}". Build the package and rerun the check.`,
          plan.target,
        ),
      );
      continue;
    }
    for (const name of resolver.exports(plan.target)) {
      const nodes = resolver.lookup(plan.target, name);
      if (nodes === undefined) {
        findings.push(
          unresolved(`Cannot resolve export "${name}" from "${plan.subpath}" to its declaration.`, plan.target),
        );
      } else if (!nodes.some((node) => ts.getJSDocCommentsAndTags(node).length > 0)) {
        findings.push({
          code: "undocumented-export/missing-jsdoc",
          location: nodes[0]?.getSourceFile().fileName ?? plan.target,
          message: `Export "${name}" from "${plan.subpath}" has no JSDoc/TSDoc on its declaration.`,
          severity: "error",
        });
      }
    }
  }
  for (const [path, candidates] of missing) {
    if (!candidates.some((candidate) => files.has(candidate)) && !plans.some((plan) => plan.target === path)) {
      findings.push(
        unresolved("Cannot resolve a declaration dependency. Build the package and rerun the check.", path),
      );
    }
  }
  return findings;
}

/**
 * Creates the top-level public export documentation check, independent of reference opt-in.
 * @returns The documentation coverage rule for documented packages, ready for registration.
 */
export function createUndocumentedExportRules(): CheckRule[] {
  return [
    {
      appliesTo: isDocumentedPackage,
      name: "undocumented-export",
      summary: "Top-level typed package exports have JSDoc/TSDoc on their declarations.",
      run: async ({ package: workspacePackage }) => {
        try {
          return await run(workspacePackage);
        } catch (error) {
          return [unresolved(error instanceof Error ? error.message : String(error), "package.json")];
        }
      },
    },
  ];
}
