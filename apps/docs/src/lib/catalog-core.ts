const DOCS_STATUSES = ["active", "experimental", "deprecated"] as const;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PackageStatus = (typeof DOCS_STATUSES)[number];

interface DocsMetadata {
  description?: string;
  label: string;
  order?: number;
  slug?: string;
  status: PackageStatus;
}

interface PackageManifest {
  codenhub?: {
    docs?: unknown;
  };
  description?: unknown;
  name?: unknown;
  private?: unknown;
}

export interface PackageMetadata {
  description?: string;
  label: string;
  order?: number;
  slug: string;
  status: PackageStatus;
}

export interface DocumentDefinition {
  relativePath: string;
  routePath: string;
  sourcePath: string;
}

export interface PackageDefinition extends PackageMetadata {
  documents: DocumentDefinition[];
  manifestPath: string;
  rootPath: string;
}

export interface PublicPackageSummary {
  description?: string;
  documentationRoute?: string;
  label: string;
  name: string;
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

function getOptionalText(value: unknown, field: string, manifestPath: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid codenhub.docs.${field} in ${manifestPath}: expected a non-empty string.`);
  }

  return value;
}

function getDocsMetadata(value: unknown, manifestPath: string): DocsMetadata {
  if (!isRecord(value)) {
    throw new Error(`Invalid codenhub.docs in ${manifestPath}: expected an object.`);
  }

  if (typeof value.status !== "string" || !DOCS_STATUSES.includes(value.status as PackageStatus)) {
    throw new Error(`Invalid codenhub.docs.status in ${manifestPath}: expected active, experimental, or deprecated.`);
  }

  if (value.order !== undefined && (!Number.isInteger(value.order) || (value.order as number) < 0)) {
    throw new Error(`Invalid codenhub.docs.order in ${manifestPath}: expected a non-negative integer.`);
  }

  const label = getOptionalText(value.label, "label", manifestPath);
  if (label === undefined) {
    throw new Error(`Invalid codenhub.docs.label in ${manifestPath}: expected a non-empty string.`);
  }

  return {
    description: getOptionalText(value.description, "description", manifestPath),
    label,
    order: value.order as number | undefined,
    slug: getOptionalText(value.slug, "slug", manifestPath),
    status: value.status as PackageStatus,
  };
}

export function parsePackageMetadata(value: unknown, manifestPath: string): PackageMetadata | null {
  if (!isRecord(value)) {
    throw new Error(`Invalid package manifest ${manifestPath}: expected an object.`);
  }

  const manifest = value as PackageManifest;
  if (!isRecord(manifest.codenhub) || manifest.codenhub.docs === undefined) {
    return null;
  }

  if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
    throw new Error(`Invalid package name in ${manifestPath}: expected a non-empty string.`);
  }

  const docs = getDocsMetadata(manifest.codenhub.docs, manifestPath);
  const fallbackSlug = manifest.name.split("/").at(-1);
  const slug = docs.slug ?? fallbackSlug;

  if (slug === undefined || !SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid codenhub.docs.slug in ${manifestPath}: expected a kebab-case slug.`);
  }

  const packageDescription =
    typeof manifest.description === "string" && manifest.description.trim() !== "" ? manifest.description : undefined;

  return {
    description: docs.description ?? packageDescription,
    label: docs.label,
    order: docs.order,
    slug,
    status: docs.status,
  };
}

export function getDocumentRoute(relativePath: string): string {
  const normalizedPath = normalizePath(relativePath);
  const pathWithoutExtension = normalizedPath.slice(0, -".md".length);
  return pathWithoutExtension === "index" || pathWithoutExtension.endsWith("/index")
    ? pathWithoutExtension.replace(/(^|\/)index$/, "")
    : pathWithoutExtension;
}

export function buildPackageDefinitions(
  manifests: Record<string, unknown>,
  sourcePaths: string[],
): PackageDefinition[] {
  const packages = Object.entries(manifests).flatMap(([rawManifestPath, manifest]) => {
    const manifestPath = normalizePath(rawManifestPath);
    const metadata = parsePackageMetadata(manifest, manifestPath);
    if (metadata === null) {
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

      const definition = definitionsByManifestPath.get(normalizePath(rawManifestPath));
      const manifestDescription =
        typeof manifest.description === "string" && manifest.description.trim() !== ""
          ? manifest.description
          : undefined;

      return [
        {
          order: definition?.order,
          summary: {
            description: definition?.description ?? manifestDescription,
            documentationRoute: definition === undefined ? undefined : `/${definition.slug}/`,
            label: definition?.label ?? manifest.name,
            name: manifest.name,
            status: definition?.status,
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
