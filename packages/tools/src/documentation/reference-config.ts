/** Resolved `codenhub.docs.reference` options for an opted-in package. */
export interface ReferenceConfig {
  /** `exports` subpath keys to document; when absent, every subpath with a type target is used. */
  entrypoints?: string[];
  /**
   * RESERVED. The shape is validated but the generator does not yet honour it. Intended to omit a
   * public symbol whose declaration originates in a matched repo-relative glob.
   */
  exclude?: string[];
  /** Whether to compile TSDoc prose. `false` renders the signature manifest only. Defaults to `true`. */
  prose: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, field: string, manifestPath: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(
      `Invalid codenhub.docs.reference.${field} in ${manifestPath}: expected an array of non-empty strings.`,
    );
  }
  return value as string[];
}

/**
 * Reads the `codenhub.docs.reference` opt-in from a package manifest.
 *
 * The key is an object to opt in, the literal `false` to opt out, or absent for
 * no generated reference; per `docs/specs/packages-reference.md`.
 * @param manifest Parsed package manifest.
 * @param manifestPath Manifest path, used in error messages.
 * @returns The resolved config, or `null` when the package has no generated reference.
 * @throws When `codenhub.docs.reference` or one of its fields is malformed.
 */
export function parseReferenceConfig(manifest: unknown, manifestPath: string): ReferenceConfig | null {
  if (!isRecord(manifest) || !isRecord(manifest.codenhub) || !isRecord(manifest.codenhub.docs)) {
    return null;
  }

  const value = manifest.codenhub.docs.reference;
  if (value === undefined || value === false) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error(`Invalid codenhub.docs.reference in ${manifestPath}: expected an object or false.`);
  }

  const entrypoints = stringArray(value.entrypoints, "entrypoints", manifestPath);
  if (entrypoints?.length === 0) {
    throw new Error(
      `Invalid codenhub.docs.reference.entrypoints in ${manifestPath}: give at least one key, or omit the field to document every entrypoint.`,
    );
  }
  if (entrypoints?.some((entry) => entry !== "." && !entry.startsWith("./"))) {
    throw new Error(
      `Invalid codenhub.docs.reference.entrypoints in ${manifestPath}: expected "." or "./"-prefixed keys.`,
    );
  }

  if (value.prose !== undefined && typeof value.prose !== "boolean") {
    throw new Error(`Invalid codenhub.docs.reference.prose in ${manifestPath}: expected a boolean.`);
  }

  return {
    entrypoints,
    exclude: stringArray(value.exclude, "exclude", manifestPath),
    prose: value.prose ?? true,
  };
}
