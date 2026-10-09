/** A page that takes part of an entrypoint's symbols off the entrypoint's own page. */
export interface ReferenceSplitPage {
  /** The page's `title` and H1; the page name when absent. */
  label?: string;
  /** Package-relative globs; a symbol declared in a matching file goes on this page. */
  source: string[];
}

/** How one documented entrypoint's pages are shaped. */
export interface ReferenceEntrypointPages {
  /** The entrypoint page's `title` and H1, in place of the import path. */
  label?: string;
  /** Split pages by page name, in the order symbols are matched against them. */
  split?: Record<string, ReferenceSplitPage>;
}

/** Resolved `codenhub.docs.reference` options for an opted-in package. */
export interface ReferenceConfig {
  /** `exports` subpath keys to document; when absent, every subpath with a type target is used. */
  entrypoints?: string[];
  /**
   * RESERVED. The shape is validated but the generator does not yet honour it. Intended to omit a
   * public symbol whose declaration originates in a matched repo-relative glob.
   */
  exclude?: string[];
  /** Page shaping by `exports` subpath key; an entrypoint not named here has one page with the default labels. */
  pages?: Record<string, ReferenceEntrypointPages>;
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

const PAGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function label(value: unknown, field: string, manifestPath: string): string | undefined {
  if (value !== undefined && (typeof value !== "string" || value.trim() === "")) {
    throw new Error(`Invalid codenhub.docs.reference.${field} in ${manifestPath}: expected a non-empty string.`);
  }
  return value;
}

function parsePages(value: unknown, manifestPath: string): Record<string, ReferenceEntrypointPages> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const invalid = (field: string, expected: string): Error =>
    new Error(`Invalid codenhub.docs.reference.${field} in ${manifestPath}: expected ${expected}.`);
  if (!isRecord(value)) {
    throw invalid("pages", "an object keyed by exports subpath");
  }

  return Object.fromEntries(
    Object.entries(value).map(([subpath, entry]) => {
      const field = `pages["${subpath}"]`;
      if ((subpath !== "." && !subpath.startsWith("./")) || !isRecord(entry)) {
        throw invalid(field, 'an object under a "." or "./"-prefixed key');
      }
      if (entry.split !== undefined && !isRecord(entry.split)) {
        throw invalid(`${field}.split`, "an object keyed by page name");
      }
      const split = Object.entries(entry.split ?? {}).map(([name, page]) => {
        const pageField = `${field}.split["${name}"]`;
        if (name === "index" || !PAGE_NAME.test(name) || !isRecord(page)) {
          throw invalid(pageField, "an object under a kebab-case page name other than index");
        }
        const source = stringArray(page.source, `${pageField}.source`, manifestPath);
        if (source === undefined || source.length === 0) {
          throw invalid(`${pageField}.source`, "at least one glob");
        }
        return [name, { label: label(page.label, `${pageField}.label`, manifestPath), source }];
      });
      return [
        subpath,
        {
          label: label(entry.label, `${field}.label`, manifestPath),
          split: entry.split === undefined ? undefined : Object.fromEntries(split),
        },
      ];
    }),
  );
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
    pages: parsePages(value.pages, manifestPath),
    prose: value.prose ?? true,
  };
}
