import {
  assertSingleH1,
  buildPackageDefinitions,
  buildPublicPackageSummaries,
  comparePublicDocumentPaths,
  parsePublicDocumentFrontmatter,
  type PackageStatus,
  type PublicPackageSummary,
} from "@codenhub/tools/documentation";
import type { MarkdownHeading, MarkdownInstance } from "astro";

import { rewritePackageMarkdownLinks } from "./markdown-links";

type PublicDocumentModule = MarkdownInstance<Record<string, unknown>>;

export interface PublicDocument {
  description?: string;
  headings: MarkdownHeading[];
  html: string;
  relativePath: string;
  route: string;
  routePath: string;
  title: string;
}

export interface PublicPackage {
  description?: string;
  documents: PublicDocument[];
  label: string;
  slug: string;
  status: PackageStatus;
}

/** A catalog summary plus the outbound links the landing grid renders. */
export interface CatalogPackage extends PublicPackageSummary {
  /** GitHub URL from the package's manifest `homepage`, when it points there. */
  githubUrl?: string;
  /** npmjs.com URL, when the package is published. */
  npmUrl?: string;
  /** Documentation slug, when the package publishes docs. */
  slug?: string;
}

const manifestModules = import.meta.glob<unknown>("../../../../packages/**/package.json", {
  eager: true,
  import: "default",
});
const documentModules = import.meta.glob<PublicDocumentModule>([
  "../../../../packages/**/docs/**/*.md",
  "!../../../../packages/**/docs/internal/**",
]);

async function loadCatalog(): Promise<PublicPackage[]> {
  return Promise.all(
    packageDefinitions.map(async (packageDefinition) => {
      const documents = await Promise.all(
        packageDefinition.documents.map(async (definition): Promise<PublicDocument> => {
          const loadDocument = documentModules[definition.sourcePath];
          if (loadDocument === undefined) {
            throw new Error(`Unable to load documentation source ${definition.sourcePath}.`);
          }

          const documentModule = await loadDocument();
          const headings = documentModule.getHeadings();
          const frontmatter = parsePublicDocumentFrontmatter(documentModule.frontmatter, definition.sourcePath);
          assertSingleH1(headings, definition.sourcePath);

          return {
            description: frontmatter.description,
            headings,
            html: rewritePackageMarkdownLinks(await documentModule.compiledContent(), {
              packageSlug: packageDefinition.slug,
              sourceRelativePath: definition.relativePath,
            }),
            relativePath: definition.relativePath,
            route: `/${packageDefinition.slug}/${definition.routePath}`.replace(/\/$/, "") + "/",
            routePath: definition.routePath,
            title: frontmatter.title,
          };
        }),
      );

      documents.sort((left, right) => comparePublicDocumentPaths(left.relativePath, right.relativePath));

      return {
        description: packageDefinition.description,
        documents,
        label: packageDefinition.label,
        slug: packageDefinition.slug,
        status: packageDefinition.status,
      };
    }),
  );
}

const packageDefinitions = buildPackageDefinitions(manifestModules, Object.keys(documentModules));

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

export const packages = await loadCatalog();
export const publicPackages: PublicPackageSummary[] = buildPublicPackageSummaries(manifestModules, packageDefinitions);

export const catalogPackages: CatalogPackage[] = publicPackages.map((entry) => {
  const manifest = manifestsByName.get(entry.name);
  const homepage = readString(manifest, "homepage");

  return {
    ...entry,
    githubUrl: homepage !== undefined && homepage.startsWith("https://github.com/") ? homepage : undefined,
    npmUrl: isPublished(manifest) ? `https://www.npmjs.com/package/${entry.name}` : undefined,
    slug: entry.documentationRoute?.replace(/^\/|\/$/g, ""),
  };
});
