import {
  buildPackageDefinitions,
  buildPublicPackageSummaries,
  type PublicPackageSummary,
} from "@codenhub/tools/documentation";

import { siteConfig } from "../site-config";

/** A published package plus the outbound links the index grid renders. */
export interface CatalogPackage extends PublicPackageSummary {
  /** GitHub URL from the package's manifest `homepage`, when it points there. */
  githubUrl?: string;
  /** npmjs.com URL, when the package is published. */
  npmUrl?: string;
  /** `docs.codenhub.dev` URL, when the package publishes documentation. */
  docsUrl?: string;
}

const manifestModules = import.meta.glob<unknown>("../../../../packages/**/package.json", {
  eager: true,
  import: "default",
});

// Keys only: the index links to the documentation site, it does not render docs,
// so it needs each package's document paths to derive slugs and nothing else.
const documentSourcePaths = Object.keys(
  import.meta.glob(["../../../../packages/**/docs/**/*.md", "!../../../../packages/**/docs/internal/**"]),
);

function readString(manifest: unknown, key: string): string | undefined {
  if (typeof manifest !== "object" || manifest === null) {
    return undefined;
  }
  const value = (manifest as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isPublished(manifest: unknown): boolean {
  return typeof manifest === "object" && manifest !== null && (manifest as Record<string, unknown>).private === false;
}

const manifestsByName = new Map<string, unknown>(
  Object.values(manifestModules).flatMap((manifest) => {
    const name = readString(manifest, "name");
    return name === undefined ? [] : [[name, manifest] as const];
  }),
);

const packageDefinitions = buildPackageDefinitions(manifestModules, documentSourcePaths);
const publicPackages: PublicPackageSummary[] = buildPublicPackageSummaries(manifestModules, packageDefinitions);

export const catalogPackages: CatalogPackage[] = publicPackages.map((entry) => {
  const manifest = manifestsByName.get(entry.name);
  const homepage = readString(manifest, "homepage");
  const slug = entry.documentationRoute?.replace(/^\/|\/$/g, "");

  return {
    ...entry,
    githubUrl: homepage !== undefined && homepage.startsWith("https://github.com/") ? homepage : undefined,
    npmUrl: isPublished(manifest) ? `https://www.npmjs.com/package/${entry.name}` : undefined,
    docsUrl: slug === undefined ? undefined : `${siteConfig.docsUrl}/${slug}/`,
  };
});

export const documentedCount = catalogPackages.filter((entry) => entry.documentationRoute !== undefined).length;
