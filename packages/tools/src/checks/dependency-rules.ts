import { join } from "node:path";

import { findDependencyCycles } from "../workspace/dependency-order.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { readBinaryNames, readDependencyUsage, SCENARIO_DIRECTORY } from "./dependency-usage.ts";
import type { CheckRule, Finding } from "./rule.ts";

const MANIFEST_LOCATION = "package.json";
// `peerDependencies` is deliberately absent: a peer range is the consumer's
// contract, and a `workspace:` or `catalog:` range would publish it pinned.
const INSTALLED_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
const DECLARED_FIELDS = [...INSTALLED_FIELDS, "peerDependencies"];
// What a consumer gets on install. Anything the published code imports has to be
// in one of these, or the package arrives at the consumer missing a dependency.
const CONSUMER_FIELDS = ["dependencies", "peerDependencies"];
const CATALOG_RANGE = "catalog:";
const WORKSPACE_RANGE = "workspace:";
// One package installing a dependency has no version to drift from. Two do, and
// two majors of the same library in one install tree is what this prevents.
const SHARED_DEPENDENCY_THRESHOLD = 2;
// Type packages are ambient: TypeScript loads them without any file naming them.
const TYPE_PACKAGE_PREFIX = "@types/";
// The package-local environments `docs/specs/packages-development.md` defines,
// matching the workspace globs that make them packages of their own.
const DEVELOPMENT_DIRECTORIES = new Set(["debug", "demo", "dev"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One declared dependency of a package. */
export interface DeclaredDependency {
  /** Manifest field the entry was declared in. */
  field: string;
  /** Dependency package name. */
  name: string;
  /** Declared version range. */
  range: string;
}

function readDependencies(workspacePackage: WorkspacePackage, fields: readonly string[]): DeclaredDependency[] {
  return fields.flatMap((field) => {
    const entries = workspacePackage.manifest[field];
    return isRecord(entries)
      ? Object.entries(entries).flatMap(([name, range]) => (typeof range === "string" ? [{ field, name, range }] : []))
      : [];
  });
}

/**
 * Finds external dependencies that more than one workspace package installs.
 *
 * These are the ones the catalog exists for. A dependency only one package
 * installs has no second declaration to drift from, so pinning it in place costs
 * nothing and keeps the catalog to the versions that are actually shared.
 * @param workspacePackages Every workspace package.
 * @param workspaceNames Every workspace package name, used to skip internal dependencies.
 * @returns Names of external dependencies installed by two or more packages.
 */
export function findSharedDependencies(
  workspacePackages: readonly WorkspacePackage[],
  workspaceNames: ReadonlySet<string>,
): Set<string> {
  const consumers = new Map<string, Set<string>>();
  for (const workspacePackage of workspacePackages) {
    for (const { name } of readDependencies(workspacePackage, INSTALLED_FIELDS)) {
      if (workspaceNames.has(name)) {
        continue;
      }
      const known = consumers.get(name) ?? new Set<string>();
      known.add(workspacePackage.name);
      consumers.set(name, known);
    }
  }
  return new Set(
    [...consumers.entries()]
      .filter(([, packageNames]) => packageNames.size >= SHARED_DEPENDENCY_THRESHOLD)
      .map(([name]) => name),
  );
}

/**
 * Maps every package that takes part in a dependency cycle to one of its cycles.
 * @param workspacePackages Every workspace package.
 * @returns Package name to the cycle it was first found in.
 */
export function mapCyclesByPackage(workspacePackages: readonly WorkspacePackage[]): Map<string, readonly string[]> {
  const cyclesByPackage = new Map<string, readonly string[]>();
  for (const cycle of findDependencyCycles(workspacePackages)) {
    for (const name of cycle) {
      // A package can sit on several cycles. Naming one is enough to act on, and
      // breaking it re-runs the check against whatever remains.
      if (!cyclesByPackage.has(name)) {
        cyclesByPackage.set(name, cycle);
      }
    }
  }
  return cyclesByPackage;
}

/**
 * Finds the scenario directory a development workspace runs.
 *
 * A `dev` or `debug` workspace holds little more than the configuration that
 * points a server at its parent package's playground, so the imports it has to
 * declare are the ones written in that playground rather than in its own files.
 * @param workspacePackage Package to locate a scenario directory for.
 * @param byLocation Every workspace package, keyed by repository-relative location.
 * @returns Absolute scenario directories, or an empty list for a package that runs none.
 */
export function findScenarioDirectories(
  workspacePackage: WorkspacePackage,
  byLocation: ReadonlyMap<string, WorkspacePackage>,
): string[] {
  const segments = workspacePackage.location.split("/");
  const index = segments.findIndex((segment) => DEVELOPMENT_DIRECTORIES.has(segment));
  if (index < 1) {
    return [];
  }
  const parent = byLocation.get(segments.slice(0, index).join("/"));
  return parent === undefined ? [] : [join(parent.directory, SCENARIO_DIRECTORY)];
}

/** What the dependency rule needs to know about the rest of the workspace. */
export interface DependencyContext {
  /** Every workspace package name. */
  workspaceNames: ReadonlySet<string>;
  /** External dependencies installed by more than one package. */
  sharedNames: ReadonlySet<string>;
  /** One cycle per package that takes part in any. */
  cyclesByPackage: ReadonlyMap<string, readonly string[]>;
  /** Every workspace package, keyed by repository-relative location. */
  byLocation: ReadonlyMap<string, WorkspacePackage>;
}

function checkRanges(workspacePackage: WorkspacePackage, context: DependencyContext): Finding[] {
  const findings: Finding[] = [];
  for (const { field, name, range } of readDependencies(workspacePackage, INSTALLED_FIELDS)) {
    if (context.workspaceNames.has(name)) {
      if (!range.startsWith(WORKSPACE_RANGE)) {
        findings.push({
          code: "dependencies/workspace-range",
          location: MANIFEST_LOCATION,
          message: `"${field}.${name}" should use a "workspace:" range.`,
          severity: "warning",
        });
      }
    } else if (context.sharedNames.has(name) && !range.startsWith(CATALOG_RANGE)) {
      findings.push({
        code: "dependencies/catalog",
        location: MANIFEST_LOCATION,
        message: `"${field}.${name}" is installed by more than one package and must use "catalog:".`,
        severity: "error",
      });
    }
  }
  return findings;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Decides whether a declared dependency is mentioned anywhere in a package.
 *
 * The test is deliberately permissive, because the cost of the two mistakes is
 * not symmetric: reporting a dependency that is quietly needed sends someone
 * chasing a removal that breaks a build, while missing an unused one leaves the
 * manifest as it already is. A name in a comment therefore counts as a use.
 * @param workspacePackage Package being inspected.
 * @param name Declared dependency name.
 * @param text Concatenated package text.
 * @returns `true` when nothing in the package refers to the dependency.
 */
async function isUnmentioned(workspacePackage: WorkspacePackage, name: string, text: string): Promise<boolean> {
  if (text.includes(name)) {
    return false;
  }
  const binaries = await readBinaryNames(workspacePackage, name);
  return !binaries.some((binary) => new RegExp(`\\b${escapeRegExp(binary)}\\b`).test(text));
}

async function checkUsage(workspacePackage: WorkspacePackage, context: DependencyContext): Promise<Finding[]> {
  const usage = await readDependencyUsage(
    workspacePackage,
    findScenarioDirectories(workspacePackage, context.byLocation),
  );
  const declared = readDependencies(workspacePackage, DECLARED_FIELDS);
  const declaredNames = new Set(declared.map(({ name }) => name));
  const consumerNames = new Set(
    declared.filter(({ field }) => CONSUMER_FIELDS.includes(field)).map(({ name }) => name),
  );
  const findings: Finding[] = [];

  for (const name of [...usage.authored].sort()) {
    if (!declaredNames.has(name)) {
      findings.push({
        code: "dependencies/undeclared",
        location: MANIFEST_LOCATION,
        message: `"${name}" is imported but declared in no dependency field.`,
        severity: "error",
      });
    }
  }

  // A private package is never installed as someone else's dependency, so which
  // field holds a name changes nothing about what that someone receives.
  if (!workspacePackage.isPrivate) {
    for (const name of [...usage.shipped].sort()) {
      if (declaredNames.has(name) && !consumerNames.has(name)) {
        findings.push({
          code: "dependencies/runtime-declaration",
          location: MANIFEST_LOCATION,
          message: `"${name}" is imported by published code and must be a dependency or a peerDependency.`,
          severity: "error",
        });
      }
    }
  }

  const candidates = [...declaredNames]
    .filter((name) => !name.startsWith(TYPE_PACKAGE_PREFIX))
    .filter((name) => {
      if (!name.startsWith("@") || !name.includes("/")) {
        return true;
      }
      const scopeName = name.slice(1, name.indexOf("/"));
      return !declaredNames.has(scopeName);
    })
    .sort();
  const unmentioned = await Promise.all(
    candidates.map(async (name) => isUnmentioned(workspacePackage, name, usage.text)),
  );
  for (const [index, name] of candidates.entries()) {
    if (unmentioned[index] === true) {
      findings.push({
        code: "dependencies/unused",
        location: MANIFEST_LOCATION,
        message: `"${name}" is declared but named nowhere in the package.`,
        severity: "warning",
      });
    }
  }
  return findings;
}

/**
 * Creates the rule that checks how a package declares and uses its dependencies.
 *
 * Ranges, cycles, and usage are one rule because they share a subject and a code
 * prefix: every finding is something wrong with the dependency list, and the
 * exception register waives them by the same `dependencies/` codes.
 * @param workspacePackages Every workspace package, needed by the checks that compare one against the rest.
 * @returns Dependency rules ready for registration.
 */
export function createDependencyRules(workspacePackages: readonly WorkspacePackage[]): CheckRule[] {
  const context: DependencyContext = {
    byLocation: new Map(workspacePackages.map((workspacePackage) => [workspacePackage.location, workspacePackage])),
    cyclesByPackage: mapCyclesByPackage(workspacePackages),
    sharedNames: findSharedDependencies(workspacePackages, new Set(workspacePackages.map(({ name }) => name))),
    workspaceNames: new Set(workspacePackages.map(({ name }) => name)),
  };

  return [
    {
      appliesTo: () => true,
      name: "dependencies",
      run: async ({ package: workspacePackage }) => {
        const cycle = context.cyclesByPackage.get(workspacePackage.name);
        return [
          ...checkRanges(workspacePackage, context),
          ...(cycle === undefined
            ? []
            : [
                {
                  code: "dependencies/cycle",
                  location: MANIFEST_LOCATION,
                  message: `Workspace dependency cycle: ${[...cycle, cycle[0]].join(" -> ")}.`,
                  severity: "error" as const,
                },
              ]),
          ...(await checkUsage(workspacePackage, context)),
        ];
      },
      summary: "Dependencies are declared where they are used, form no cycles, and share catalog versions.",
    },
  ];
}
