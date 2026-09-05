import {
  assertSingleH1,
  buildPackageDefinitions,
  buildPublicPackageSummaries,
  comparePublicDocuments,
  parsePublicDocumentFrontmatter,
  type PackageStatus,
  type PublicPackageSummary,
} from "@codenhub/tools/documentation";
import type { MarkdownHeading, MarkdownInstance } from "astro";

import { applyFolderCuration } from "./folder-curation";
import { rewritePackageMarkdownLinks } from "./markdown-links";

type PublicDocumentModule = MarkdownInstance<Record<string, unknown>>;

export interface PublicDocument {
  description?: string;
  /** Section label from a folder `index.md`, when it sets one. */
  group?: string;
  headings: MarkdownHeading[];
  html: string;
  /** Explicit sidebar position from frontmatter, when the page sets one. */
  order?: number;
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

interface LoadedDocument extends PublicDocument {
  /** Whether this document is a folder's curated entrypoint. Stripped before publication. */
  curated?: boolean;
  /** Compiled HTML before local links are rewritten, used only to resolve curated-folder links. */
  rawHtml: string;
}

async function loadCatalog(): Promise<PublicPackage[]> {
  return Promise.all(
    packageDefinitions.map(async (packageDefinition) => {
      const loadedDocuments = await Promise.all(
        packageDefinition.documents.map(async (definition): Promise<LoadedDocument> => {
          const loadDocument = documentModules[definition.sourcePath];
          if (loadDocument === undefined) {
            throw new Error(`Unable to load documentation source ${definition.sourcePath}.`);
          }

          const documentModule = await loadDocument();
          const headings = documentModule.getHeadings();
          const frontmatter = parsePublicDocumentFrontmatter(documentModule.frontmatter, definition.sourcePath);
          assertSingleH1(headings, definition.sourcePath);
          const rawHtml = await documentModule.compiledContent();

          return {
            curated: frontmatter.curated,
            description: frontmatter.description,
            group: frontmatter.group,
            headings,
            html: rewritePackageMarkdownLinks(rawHtml, {
              packageSlug: packageDefinition.slug,
              sourceRelativePath: definition.relativePath,
            }),
            order: frontmatter.order,
            rawHtml,
            relativePath: definition.relativePath,
            route: `/${packageDefinition.slug}/${definition.routePath}`.replace(/\/$/, "") + "/",
            routePath: definition.routePath,
            title: frontmatter.title,
          };
        }),
      );

      const documents: PublicDocument[] = applyFolderCuration(loadedDocuments).map(
        ({ curated: _curated, rawHtml: _rawHtml, ...document }) => document,
      );
      documents.sort(comparePublicDocuments);

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
