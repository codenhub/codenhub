import type { PackageRelease, SizeReport } from "@codenhub/tools/release";

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
  /** Every release, highest version first, pre-releases included. */
  history: PackageRelease[];
  /** The most recently published release, which a backport can make other than the highest version. */
  lastPublished?: PackageRelease;
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
  const isSubpath = (key: string): boolean => key === "." || key.startsWith("./");
  if (!keys.some(isSubpath)) {
    return keys.length > 0 ? ["."] : [];
  }
  // `./package.json` is exported for tools that read the manifest, not as code to import.
  return keys.filter((key) => isSubpath(key) && key !== "./package.json");
}

/**
 * Reads a package's releases from its history.
 * @param history Releases highest version first, as `@codenhub/tools/release` records them.
 * @returns The history, its most recently published release, and its newest stable release.
 */
export function describeReleases(history: readonly PackageRelease[] = []): PackageReleases {
  const lastPublished = history.reduce<PackageRelease | undefined>(
    (newest, release) =>
      newest === undefined || Date.parse(release.date) > Date.parse(newest.date) ? release : newest,
    undefined,
  );
  return { history: [...history], lastPublished, latest: history.find((release) => !release.isPrerelease) };
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

const SIZE_UNITS = [
  [1_000_000, "MB"],
  [1000, "kB"],
] as const;

/**
 * Formats a byte count the way bundle sizes are usually quoted, in decimal units.
 * @param bytes Byte count.
 * @returns Such as `840 B`, `27.6 kB`, or `16.6 MB`.
 */
export function formatBytes(bytes: number): string {
  // The unit is chosen on the rounded figure, so 999,960 bytes reads `1.0 MB`, not `1000.0 kB`.
  const unit = SIZE_UNITS.find(([size]) => Number((bytes / size).toFixed(1)) >= 1);
  return unit === undefined ? `${bytes} B` : `${(bytes / unit[0]).toFixed(1)} ${unit[1]}`;
}

/**
 * Describes what importing a package's root entrypoint costs, from its release's `size.json`.
 *
 * A root with no runtime code, such as one that only re-exports types, costs
 * nothing, so it reads `0 B` rather than the 20 bytes gzip spends on an empty file.
 * @param size The release's size report, absent for a release cut before sizes were recorded.
 * @returns Such as `27.6 kB gzip`, or `undefined` when the release has no measured root entrypoint.
 */
export function describeRootSize(size: SizeReport | undefined): string | undefined {
  const root = size?.entrypoints["."];
  if (root === undefined) {
    return undefined;
  }
  return `${formatBytes(root.minified === 0 ? 0 : root.gzip)} gzip`;
}
