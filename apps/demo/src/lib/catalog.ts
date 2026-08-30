import { parsePackageMetadata, type PackageStatus } from "@codenhub/tools/documentation";

import { siteConfig } from "../site-config";

/** One package with a mounted demo, ready to present on the landing page. */
export interface DemoPackage {
  /** Catalog description, falling back to the package's own `description`. */
  description?: string;
  /** `docs.codenhub.dev` route for the package's public documentation, when it declares any. */
  docsUrl?: string;
  /** GitHub URL for the package's own directory, from its manifest `homepage`. */
  githubUrl?: string;
  /** Human-readable package label. */
  label: string;
  /** npmjs.com URL, when the package is published. */
  npmUrl?: string;
  /** Path segment this demo is mounted under. */
  slug: string;
  /** Documentation status, when the package declares `codenhub.docs`. */
  status?: PackageStatus;
}

interface PackageManifest {
  description?: unknown;
  homepage?: unknown;
  name?: unknown;
  private?: unknown;
}

const DEMO_MANIFEST_PATTERN = /\/packages\/([^/]+)\/demo\/package\.json$/;
const PACKAGE_MANIFEST_PATTERN = /\/packages\/([^/]+)\/package\.json$/;

const demoManifestPaths = Object.keys(import.meta.glob("../../../../packages/*/demo/package.json"));
const packageManifestModules = import.meta.glob<Record<string, unknown>>("../../../../packages/*/package.json", {
  eager: true,
  import: "default",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSlug(manifestPath: string): string {
  const match = DEMO_MANIFEST_PATTERN.exec(manifestPath);
  if (match === null) {
    throw new Error(`Unable to derive a package slug from ${manifestPath}.`);
  }
  return match[1];
}

const packageManifestsBySlug = new Map<string, PackageManifest>(
  Object.entries(packageManifestModules).flatMap(([manifestPath, manifest]) => {
    const match = PACKAGE_MANIFEST_PATTERN.exec(manifestPath);
    return match === null || !isRecord(manifest) ? [] : [[match[1], manifest as PackageManifest]];
  }),
);

function toGithubUrl(manifest: PackageManifest | undefined): string | undefined {
  return typeof manifest?.homepage === "string" && manifest.homepage.startsWith("https://github.com/")
    ? manifest.homepage
    : undefined;
}

function toNpmUrl(manifest: PackageManifest | undefined): string | undefined {
  return manifest?.private === false && typeof manifest.name === "string"
    ? `https://www.npmjs.com/package/${manifest.name}`
    : undefined;
}

function toDescription(
  manifest: PackageManifest | undefined,
  metadataDescription: string | undefined,
): string | undefined {
  if (metadataDescription !== undefined) {
    return metadataDescription;
  }
  return typeof manifest?.description === "string" ? manifest.description : undefined;
}

function toLabel(manifest: PackageManifest | undefined, metadataLabel: string | undefined, slug: string): string {
  if (metadataLabel !== undefined) {
    return metadataLabel;
  }
  const name = typeof manifest?.name === "string" ? manifest.name : undefined;
  return name?.replace(/^@codenhub\//, "") ?? slug;
}

export const demoPackages: DemoPackage[] = demoManifestPaths
  .map((manifestPath) => {
    const slug = toSlug(manifestPath);
    const manifest = packageManifestsBySlug.get(slug);
    const metadata = manifest === undefined ? null : parsePackageMetadata(manifest, `packages/${slug}/package.json`);

    return {
      description: toDescription(manifest, metadata?.description),
      docsUrl: metadata === null ? undefined : `${siteConfig.docsUrl}/${metadata.slug}/`,
      githubUrl: toGithubUrl(manifest),
      label: toLabel(manifest, metadata?.label, slug),
      npmUrl: toNpmUrl(manifest),
      slug,
      status: metadata?.status,
    };
  })
  .sort((left, right) => left.label.localeCompare(right.label));
