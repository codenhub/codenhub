import type { PackageRelease } from "@codenhub/tools/release";

/** What a consumer can tell about a package from its released manifest, before reading any docs. */
export interface PackageProperties {
  /** Packages inlined into the build instead of installed, from `codenhub.bundled`. */
  bundled: string[];
  /** Number of runtime `dependencies` a consumer installs. */
  dependencyCount: number;
  /** Public entrypoints, the keys of `exports`. */
  entrypoints: string[];
  /** Whether the package is ESM-only: `type: module` and no `require` export condition. */
  isEsmOnly: boolean;
  /** Whether `sideEffects` is `false`, so bundlers can drop unused modules. */
  isSideEffectFree: boolean;
  /** Names of `peerDependencies`. */
  peerDependencies: string[];
  /** Whether the package ships TypeScript declarations. */
  shipsTypes: boolean;
}

/** A package's releases, split into what the index shows first and the rest. */
export interface PackageReleases {
  /** Every release, newest first, pre-releases included. */
  history: PackageRelease[];
  /** Newest stable release, which `npm install` resolves by default. */
  latest?: PackageRelease;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCondition(value: unknown, condition: string): boolean {
  return (
    isRecord(value) &&
    Object.entries(value).some(([key, nested]) => key === condition || hasCondition(nested, condition))
  );
}

// An `exports` string, or a map of conditions with no subpath keys, is the
// root entrypoint alone; otherwise the subpath keys are the entrypoints.
function entrypointsOf(exportsField: unknown): string[] {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return ["."];
  }
  const keys = isRecord(exportsField) ? Object.keys(exportsField) : [];
  const subpaths = keys.filter((key) => key === "." || key.startsWith("./"));
  return subpaths.length === 0 && keys.length > 0 ? ["."] : subpaths;
}

/**
 * Reads a package's releases from its history.
 * @param history Releases newest first, as `@codenhub/tools/release` records them.
 * @returns The history and its newest stable release.
 */
export function describeReleases(history: readonly PackageRelease[] = []): PackageReleases {
  return { history: [...history], latest: history.find((release) => !release.isPrerelease) };
}

/**
 * Derives the properties the index shows from a released manifest.
 * @param manifest Parsed `package.json`.
 * @returns The package's properties.
 */
export function describeProperties(manifest: Record<string, unknown>): PackageProperties {
  const exportsField = isRecord(manifest.exports) ? manifest.exports : {};
  const codenhub = isRecord(manifest.codenhub) ? manifest.codenhub : {};
  const names = (value: unknown): string[] => (isRecord(value) ? Object.keys(value).sort() : []);

  return {
    bundled: Array.isArray(codenhub.bundled) ? codenhub.bundled.filter((name) => typeof name === "string") : [],
    dependencyCount: names(manifest.dependencies).length,
    entrypoints: entrypointsOf(manifest.exports),
    isEsmOnly: manifest.type === "module" && !hasCondition(exportsField, "require"),
    isSideEffectFree: manifest.sideEffects === false,
    peerDependencies: names(manifest.peerDependencies),
    shipsTypes: typeof manifest.types === "string" || hasCondition(exportsField, "types"),
  };
}
