const STATUSES = ["active", "experimental", "deprecated"] as const;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Identity fields `codenhub.docs` held before they moved to `codenhub` itself.
const LEGACY_FIELDS = ["demoUrl", "description", "label", "listed", "order", "slug", "status"] as const;
const IDENTITY_FIELDS = [...LEGACY_FIELDS, "logo"] as const;

/** Package status declared by `codenhub.status`. */
export type PackageStatus = (typeof STATUSES)[number];

interface PackageManifest {
  codenhub?: unknown;
  description?: unknown;
  name?: unknown;
  private?: unknown;
}

/** Resolved `codenhub` package metadata with defaults applied. */
export interface PackageMetadata {
  /** Absolute URL of a standalone live demo application. */
  demoUrl?: string;
  /** Catalog description, falling back to the package description. */
  description?: string;
  /** Whether the package declares `codenhub.docs`, opting into the documentation site. */
  documented: boolean;
  /** Human-readable package label. */
  label: string;
  /** Whether catalogs list the package. */
  listed: boolean;
  /** Package-relative path to an SVG logo. */
  logo?: string;
  /** Relative ordering hint. */
  order?: number;
  /** Stable kebab-case identifier, defaulting to the unscoped package name. */
  slug: string;
  /** Package status. */
  status: PackageStatus;
}

/** One public Markdown document belonging to a package. */
export interface DocumentDefinition {
  /** Path relative to the package `docs/` directory. */
  relativePath: string;
  /** Route segment derived from `relativePath`. */
  routePath: string;
  /** Path relative to the repository root. */
  sourcePath: string;
}

/** A package that declares public documentation, with its documents resolved. */
export interface PackageDefinition extends PackageMetadata {
  /** Public documents, unordered. */
  documents: DocumentDefinition[];
  /** Path to the package manifest. */
  manifestPath: string;
  /** Package directory containing the manifest. */
  rootPath: string;
}

/** Catalog entry for a published package. */
export interface PublicPackageSummary {
  /** Catalog description. */
  description?: string;
  /** Documentation route when the package declares public documentation. */
  documentationRoute?: string;
  /** Human-readable label. */
  label: string;
  /** Published package name. */
  name: string;
  /** Package status when the package declares public documentation. */
  status?: PackageStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function declaresAny(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.some((field) => value[field] !== undefined);
}

/**
 * Reports whether a manifest declares its identity in the pre-migration shape,
 * inside `codenhub.docs` instead of on `codenhub` itself.
 *
 * Only release tags cut before the migration still carry that shape. The reader
 * accepts it for them alone, and `hub check` rejects it in the working tree;
 * `docs/specs/packages-metadata.md` says when the shape stops being read.
 * @param manifest Parsed package manifest.
 * @returns `true` when `codenhub.docs` holds any identity field.
 */
export function usesLegacyMetadata(manifest: unknown): boolean {
  if (!isRecord(manifest) || !isRecord(manifest.codenhub)) {
    return false;
  }
  const docs = manifest.codenhub.docs;
  return isRecord(docs) && declaresAny(docs, LEGACY_FIELDS);
}

function getOptionalText(value: unknown, field: string, manifestPath: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid ${field} in ${manifestPath}: expected a non-empty string.`);
  }

  return value;
}

function getLogo(value: unknown, manifestPath: string): string | undefined {
  const logo = getOptionalText(value, "codenhub.logo", manifestPath);
  if (logo === undefined) {
    return undefined;
  }
  const segments = logo.split("/");
  if (
    logo.includes("\\") ||
    logo.startsWith("/") ||
    /^[A-Za-z]:/u.test(logo) ||
    segments.includes("..") ||
    segments.includes(".") ||
    !logo.endsWith(".svg")
  ) {
    throw new Error(`Invalid codenhub.logo in ${manifestPath}: expected a package-relative path to an .svg file.`);
  }
  return logo;
}

/**
 * Reads a package's `codenhub` metadata.
 *
 * Identity lives on `codenhub` itself. A manifest from a release tag cut before
 * the migration keeps it inside `codenhub.docs` instead, and reads the same.
 * @param value Parsed package manifest.
 * @param manifestPath Manifest path used in error messages.
 * @returns Resolved metadata, or `null` when the package declares neither identity nor `codenhub.docs`.
 * @throws When the manifest or its metadata is malformed, or mixes both shapes.
 */
export function parsePackageMetadata(value: unknown, manifestPath: string): PackageMetadata | null {
  if (!isRecord(value)) {
    throw new Error(`Invalid package manifest ${manifestPath}: expected an object.`);
  }

  const manifest = value as PackageManifest;
  if (!isRecord(manifest.codenhub)) {
    return null;
  }

  const codenhub = manifest.codenhub;
  const docs = codenhub.docs;
  if (docs !== undefined && !isRecord(docs)) {
    throw new Error(`Invalid codenhub.docs in ${manifestPath}: expected an object.`);
  }

  const legacy = usesLegacyMetadata(manifest);
  const unknownDocsField = legacy ? undefined : Object.keys(docs ?? {}).find((field) => field !== "reference");
  if (unknownDocsField !== undefined) {
    throw new Error(
      `Invalid codenhub.docs.${unknownDocsField} in ${manifestPath}: codenhub.docs only holds "reference".`,
    );
  }
  if (legacy && declaresAny(codenhub, IDENTITY_FIELDS)) {
    throw new Error(
      `Invalid codenhub in ${manifestPath}: declare package metadata on codenhub, not inside codenhub.docs.`,
    );
  }
  if (docs === undefined && !declaresAny(codenhub, IDENTITY_FIELDS)) {
    return null;
  }

  if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
    throw new Error(`Invalid package name in ${manifestPath}: expected a non-empty string.`);
  }

  const source = legacy ? (docs as Record<string, unknown>) : codenhub;
  const prefix = legacy ? "codenhub.docs" : "codenhub";

  if (typeof source.status !== "string" || !STATUSES.includes(source.status as PackageStatus)) {
    throw new Error(`Invalid ${prefix}.status in ${manifestPath}: expected active, experimental, or deprecated.`);
  }

  if (source.order !== undefined && (!Number.isInteger(source.order) || (source.order as number) < 0)) {
    throw new Error(`Invalid ${prefix}.order in ${manifestPath}: expected a non-negative integer.`);
  }

  if (source.listed !== undefined && typeof source.listed !== "boolean") {
    throw new Error(`Invalid ${prefix}.listed in ${manifestPath}: expected a boolean.`);
  }

  const label = getOptionalText(source.label, `${prefix}.label`, manifestPath);
  if (label === undefined) {
    throw new Error(`Invalid ${prefix}.label in ${manifestPath}: expected a non-empty string.`);
  }

  const demoUrl = getOptionalText(source.demoUrl, `${prefix}.demoUrl`, manifestPath);
  if (demoUrl !== undefined && !URL.canParse(demoUrl)) {
    throw new Error(`Invalid ${prefix}.demoUrl in ${manifestPath}: expected an absolute URL.`);
  }

  const slug = getOptionalText(source.slug, `${prefix}.slug`, manifestPath) ?? manifest.name.split("/").at(-1);
  if (slug === undefined || !SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid ${prefix}.slug in ${manifestPath}: expected a kebab-case slug.`);
  }

  const packageDescription =
    typeof manifest.description === "string" && manifest.description.trim() !== "" ? manifest.description : undefined;

  return {
    demoUrl,
    description: getOptionalText(source.description, `${prefix}.description`, manifestPath) ?? packageDescription,
    documented: docs !== undefined,
    label,
    listed: (source.listed as boolean | undefined) ?? true,
    logo: legacy ? undefined : getLogo(codenhub.logo, manifestPath),
    order: source.order as number | undefined,
    slug,
    status: source.status as PackageStatus,
  };
}

/**
 * Derives the route segment for a documentation path.
 * @param relativePath Path relative to the package `docs/` directory.
 * @returns Route segment with the extension and any trailing `index` removed.
 */
export function getDocumentRoute(relativePath: string): string {
  const normalizedPath = normalizePath(relativePath);
  const pathWithoutExtension = normalizedPath.slice(0, -".md".length);
  return pathWithoutExtension === "index" || pathWithoutExtension.endsWith("/index")
    ? pathWithoutExtension.replace(/(^|\/)index$/, "")
    : pathWithoutExtension;
}

/**
 * Builds the documented packages of a workspace from manifests and document paths.
 * @param manifests Parsed manifests keyed by manifest path.
 * @param sourcePaths Every Markdown path considered for publication.
 * @returns Documented packages in catalog order.
 * @throws When metadata is malformed, `docs/index.md` is missing, or a slug or route repeats.
 */
export function buildPackageDefinitions(
  manifests: Record<string, unknown>,
  sourcePaths: string[],
): PackageDefinition[] {
  const packages = Object.entries(manifests).flatMap(([rawManifestPath, manifest]) => {
    const manifestPath = normalizePath(rawManifestPath);
    const metadata = parsePackageMetadata(manifest, manifestPath);
    if (metadata === null || !metadata.documented) {
      return [];
    }

    const rootPath = manifestPath.slice(0, -"/package.json".length);
    const docsPrefix = `${rootPath}/docs/`;
    const documents = sourcePaths
      .map(normalizePath)
      .filter((sourcePath) => sourcePath.startsWith(docsPrefix))
      .map((sourcePath) => ({ sourcePath, relativePath: sourcePath.slice(docsPrefix.length) }))
      .filter(({ relativePath }) => !relativePath.startsWith("internal/"))
      .map(({ sourcePath, relativePath }) => ({
        relativePath,
        routePath: getDocumentRoute(relativePath),
        sourcePath,
      }));

    if (!documents.some(({ relativePath }) => relativePath === "index.md")) {
      throw new Error(`Missing docs/index.md for ${metadata.label} (${manifestPath}).`);
    }

    const routes = new Set<string>();
    for (const document of documents) {
      if (routes.has(document.routePath)) {
        throw new Error(`Duplicate documentation route /${metadata.slug}/${document.routePath} in ${manifestPath}.`);
      }
      routes.add(document.routePath);
    }

    return [{ ...metadata, documents, manifestPath, rootPath }];
  });

  const slugs = new Map<string, string>();
  for (const packageDefinition of packages) {
    const existingManifest = slugs.get(packageDefinition.slug);
    if (existingManifest !== undefined) {
      throw new Error(
        `Duplicate documentation slug "${packageDefinition.slug}" in ${existingManifest} and ${packageDefinition.manifestPath}.`,
      );
    }
    slugs.set(packageDefinition.slug, packageDefinition.manifestPath);
  }

  return packages.sort(
    (left, right) =>
      (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
      compareText(left.label, right.label) ||
      compareText(left.slug, right.slug),
  );
}

/**
 * Builds catalog entries for every published package.
 * @param manifests Parsed manifests keyed by manifest path.
 * @param definitions Documented packages produced by {@link buildPackageDefinitions}.
 * @returns Catalog entries in presentation order, omitting unlisted packages.
 * @throws When a published manifest has no usable name.
 */
export function buildPublicPackageSummaries(
  manifests: Record<string, unknown>,
  definitions: PackageDefinition[],
): PublicPackageSummary[] {
  const definitionsByManifestPath = new Map(
    definitions.map((definition) => [normalizePath(definition.manifestPath), definition]),
  );

  return Object.entries(manifests)
    .flatMap(([rawManifestPath, value]) => {
      if (!isRecord(value) || value.private !== false) {
        return [];
      }

      const manifest = value as PackageManifest;
      if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
        throw new Error(`Invalid package name in ${rawManifestPath}: expected a non-empty string.`);
      }

      // Identity is read here rather than taken from the definitions, which
      // only hold packages that opt into the documentation site.
      const metadata = parsePackageMetadata(value, rawManifestPath) ?? undefined;
      const definition = definitionsByManifestPath.get(normalizePath(rawManifestPath));
      if (metadata?.listed === false) {
        return [];
      }

      const manifestDescription =
        typeof manifest.description === "string" && manifest.description.trim() !== ""
          ? manifest.description
          : undefined;

      return [
        {
          order: metadata?.order,
          summary: {
            description: metadata?.description ?? manifestDescription,
            documentationRoute: definition === undefined ? undefined : `/${definition.slug}/`,
            label: metadata?.label ?? manifest.name,
            name: manifest.name,
            status: metadata?.status,
          } satisfies PublicPackageSummary,
        },
      ];
    })
    .sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
        compareText(left.summary.label, right.summary.label) ||
        compareText(left.summary.name, right.summary.name),
    )
    .map(({ summary }) => summary);
}
