import { packageDemoUrl, packageDocsUrl, packageNpmUrl } from "@codenhub/app-shell/package-links";
import {
  buildPackageDefinitions,
  buildPublicPackageSummaries,
  parsePackageMetadata,
  type PublicPackageSummary,
} from "@codenhub/tools/documentation";
import { parseSizeReport, type ReleaseHistory, type SizeReport } from "@codenhub/tools/release";

import { siteConfig } from "../site-config";
import { describeProperties, describeReleases, type PackageProperties, type PackageReleases } from "./package-facts";
import type { ReadmeBases } from "./readme";

/** Outbound links for one package, each present only when its target exists. */
export interface CatalogLinks {
  /** Changelog on the documentation site, when the package keeps one. */
  changelog?: string;
  /** Live demo application. */
  demo?: string;
  /** Documentation site overview, when the package publishes documentation. */
  docs?: string;
  /** The package's directory on GitHub, from its manifest `homepage`. */
  github?: string;
  /** `llms.txt` as released, on GitHub at the release tag. */
  llms?: string;
  /** npmjs.com listing. */
  npm: string;
}

/** A released package with everything the index shows about it. */
export interface CatalogPackage extends PublicPackageSummary {
  /** SPDX license expression from the manifest. */
  license?: string;
  links: CatalogLinks;
  /** Site path of the package's logo, when it declares one. */
  logoUrl?: string;
  properties: PackageProperties;
  /** The package's README, with where its package-relative links and images resolve. */
  readme?: ReadmeBases & { source: string };
  releases: PackageReleases;
  /** Bundle sizes the release recorded, absent for a release cut before sizes were. */
  size?: SizeReport;
  /** Stable kebab-case identifier from the package metadata. */
  slug: string;
}

// Two roots, chosen by `import.meta.env.PROD`, as in `apps/docs`: `astro dev`
// reads the working tree, and a production build reads `.codenhub-published`,
// which `release-snapshot-integration.ts` writes before Vite scans these globs.
// It holds only released packages, each exactly as it was at its latest stable
// release tag, so an unreleased package or change never reaches the index.
// (docs/ci.md, "The main site")
const manifestModules = import.meta.env.PROD
  ? import.meta.glob<unknown>("../../.codenhub-published/packages/**/package.json", { eager: true, import: "default" })
  : import.meta.glob<unknown>("../../../../packages/**/package.json", { eager: true, import: "default" });

// Keys only: the index links to pages, it does not render them, so it needs a
// package's document paths to derive its slug and changelog, and nothing else.
const documentSourcePaths = Object.keys(
  import.meta.env.PROD
    ? import.meta.glob([
        "../../.codenhub-published/packages/**/docs/**/*.md",
        "!../../.codenhub-published/packages/**/docs/internal/**",
      ])
    : import.meta.glob(["../../../../packages/**/docs/**/*.md", "!../../../../packages/**/docs/internal/**"]),
);
const llmsPaths = Object.keys(
  import.meta.env.PROD
    ? import.meta.glob("../../.codenhub-published/packages/**/llms.txt", { query: "?raw" })
    : import.meta.glob("../../../../packages/**/llms.txt", { query: "?raw" }),
);
const readmeModules = import.meta.env.PROD
  ? import.meta.glob<string>("../../.codenhub-published/packages/**/README.md", {
      eager: true,
      import: "default",
      query: "?raw",
    })
  : import.meta.glob<string>("../../../../packages/**/README.md", { eager: true, import: "default", query: "?raw" });
// A release's `size.json`, written by `hub release --cut` (docs/specs/packages-lifecycle.md, "Bundle size").
const sizeModules = import.meta.env.PROD
  ? import.meta.glob<string>("../../.codenhub-published/packages/**/size.json", {
      eager: true,
      import: "default",
      query: "?raw",
    })
  : import.meta.glob<string>("../../../../packages/**/size.json", { eager: true, import: "default", query: "?raw" });
// The demo site builds from the working tree, so it decides which demos exist.
const demoRoots = new Set(
  Object.keys(import.meta.glob("../../../../packages/*/demo/package.json")).map((path) =>
    path.slice(0, -"/demo/package.json".length),
  ),
);
// Written in every run, from fetched tags in production and local tags otherwise.
const releaseHistory: ReleaseHistory =
  Object.values(
    import.meta.glob<ReleaseHistory>("../../.codenhub-published/releases.json", { eager: true, import: "default" }),
  )[0] ?? {};

function readString(manifest: Record<string, unknown>, key: string): string | undefined {
  const value = manifest[key];
  return typeof value === "string" ? value : undefined;
}

function packageRoot(manifestPath: string): string {
  return manifestPath.slice(0, -"/package.json".length);
}

function workspaceRoot(manifestPath: string): string {
  return packageRoot(manifestPath).replace(/^.*?\/packages\//u, "packages/");
}

const definitions = buildPackageDefinitions(manifestModules, documentSourcePaths);
const summaries = buildPublicPackageSummaries(manifestModules, definitions);
const manifestPathsByName = new Map(
  Object.entries(manifestModules).flatMap(([manifestPath, manifest]) => {
    const name = typeof manifest === "object" && manifest !== null ? (manifest as { name?: unknown }).name : undefined;
    return typeof name === "string" ? [[name, manifestPath] as const] : [];
  }),
);

function describePackage(summary: PublicPackageSummary): CatalogPackage {
  const manifestPath = manifestPathsByName.get(summary.name) as string;
  const manifest = manifestModules[manifestPath] as Record<string, unknown>;
  // `null` for a release cut before `codenhub` metadata existed, which the
  // summary already fell back to the npm name and description for.
  const metadata = parsePackageMetadata(manifest, manifestPath);
  const slug = metadata?.slug ?? summary.name.slice(summary.name.lastIndexOf("/") + 1);
  const root = packageRoot(manifestPath);
  const releases = describeReleases(releaseHistory[summary.name]);
  const isDocumented = summary.documentationRoute !== undefined;
  const homepage = readString(manifest, "homepage");
  const docs = isDocumented && siteConfig.docsUrl !== undefined ? packageDocsUrl(siteConfig.docsUrl, slug) : undefined;
  const tag = releases.latest === undefined ? undefined : `${summary.name}@${releases.latest.version}`;
  const sizeContents = sizeModules[`${root}/size.json`];
  const readmeSource = readmeModules[`${root}/README.md`];

  return {
    ...summary,
    license: readString(manifest, "license"),
    links: {
      changelog:
        docs !== undefined && documentSourcePaths.includes(`${root}/docs/changelog/index.md`)
          ? `${docs}changelog/`
          : undefined,
      demo:
        metadata?.demoUrl ??
        (demoRoots.has(`../../../../${workspaceRoot(manifestPath)}`) && siteConfig.demoUrl !== undefined
          ? packageDemoUrl(siteConfig.demoUrl, slug)
          : undefined),
      docs,
      github: homepage?.startsWith("https://github.com/") === true ? homepage : undefined,
      llms:
        tag !== undefined && llmsPaths.includes(`${root}/llms.txt`)
          ? `${siteConfig.githubUrl}/blob/${tag}/${workspaceRoot(manifestPath)}/llms.txt`
          : undefined,
      npm: packageNpmUrl(summary.name),
    },
    logoUrl: metadata?.logo === undefined ? undefined : `/logos/${slug}.svg`,
    properties: describeProperties(manifest),
    readme:
      readmeSource === undefined
        ? undefined
        : {
            // The release's files on GitHub; the default branch's when there is no stable release to pin.
            baseUrl: `${siteConfig.githubUrl}/blob/${tag ?? "HEAD"}/${workspaceRoot(manifestPath)}/`,
            imageBaseUrl: `${siteConfig.githubUrl}/raw/${tag ?? "HEAD"}/${workspaceRoot(manifestPath)}/`,
            source: readmeSource,
          },
    releases,
    size: sizeContents === undefined ? undefined : parseSizeReport(sizeContents, `${root}/size.json`),
    slug,
  };
}

/** Every listed public package the index presents, in catalog order. */
export const catalogPackages: CatalogPackage[] = summaries.map(describePackage);

// Each slug is a page path; two packages on one slug would leave one without a page.
const packagesBySlug = new Map<string, string>();
for (const entry of catalogPackages) {
  const other = packagesBySlug.get(entry.slug);
  if (other !== undefined) {
    throw new Error(`${other} and ${entry.name} share the slug "${entry.slug}"; give one a different codenhub.slug.`);
  }
  packagesBySlug.set(entry.slug, entry.name);
}

export const documentedCount = catalogPackages.filter((entry) => entry.documentationRoute !== undefined).length;
