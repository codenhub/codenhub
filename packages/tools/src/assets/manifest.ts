const UNSAFE_SEGMENT = /(?:^|\/)\.\.(?:\/|$)/;

/** One file a package pulls from root `assets/` and where it places it. */
export interface AssetEntry {
  /** Path relative to root `assets/`, forward-slashed. */
  from: string;
  /** Path relative to the package directory, forward-slashed — the package's own choice. */
  to: string;
}

interface AssetsManifest {
  codenhub?: {
    assets?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPathField(value: unknown, field: string, index: number, manifestPath: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid codenhub.assets[${index}].${field} in ${manifestPath}: expected a non-empty string.`);
  }
  if (value.includes("\\")) {
    throw new Error(`Invalid codenhub.assets[${index}].${field} in ${manifestPath}: use forward slashes only.`);
  }
  if (value.startsWith("/") || UNSAFE_SEGMENT.test(value)) {
    throw new Error(
      `Invalid codenhub.assets[${index}].${field} in ${manifestPath}: must be a relative path with no "..".`,
    );
  }
  return value;
}

function getAssetEntry(value: unknown, index: number, manifestPath: string): AssetEntry {
  if (!isRecord(value)) {
    throw new Error(`Invalid codenhub.assets[${index}] in ${manifestPath}: expected an object.`);
  }
  return {
    from: getPathField(value.from, "from", index, manifestPath),
    to: getPathField(value.to, "to", index, manifestPath),
  };
}

function checkNoDuplicateDestinations(entries: readonly AssetEntry[], manifestPath: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.to)) {
      throw new Error(`Invalid codenhub.assets in ${manifestPath}: "to": "${entry.to}" is declared more than once.`);
    }
    seen.add(entry.to);
  }
}

/**
 * Reads the `codenhub.assets` entries a package declares.
 *
 * Each entry names a file under root `assets/` and where this package places it —
 * placement is the package's own decision, not something the mechanism assumes.
 * @param value Parsed package manifest.
 * @param manifestPath Manifest path used in error messages.
 * @returns Declared entries, or an empty array when the package declares none.
 * @throws When `codenhub.assets` is present but malformed, or when two entries
 * declare the same `to` — copying both would race for the same destination.
 */
export function parseAssetEntries(value: unknown, manifestPath: string): AssetEntry[] {
  if (!isRecord(value)) {
    throw new Error(`Invalid package manifest ${manifestPath}: expected an object.`);
  }

  const manifest = value as AssetsManifest;
  const assets = manifest.codenhub?.assets;
  if (assets === undefined) {
    return [];
  }
  if (!Array.isArray(assets)) {
    throw new Error(`Invalid codenhub.assets in ${manifestPath}: expected an array.`);
  }

  const entries = assets.map((entry, index) => getAssetEntry(entry, index, manifestPath));
  checkNoDuplicateDestinations(entries, manifestPath);
  return entries;
}
