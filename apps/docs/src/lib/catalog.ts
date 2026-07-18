import type { MarkdownHeading, MarkdownInstance } from "astro";

import {
  buildPackageDefinitions,
  buildPublicPackageSummaries,
  type PackageStatus,
  type PublicPackageSummary,
} from "./catalog-core";
import { rewritePackageMarkdownLinks } from "./markdown-links";
import { assertSingleH1, comparePublicDocumentPaths, parsePublicDocumentFrontmatter } from "./public-document-policy";

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

export const packages = await loadCatalog();
export const publicPackages: PublicPackageSummary[] = buildPublicPackageSummaries(manifestModules, packageDefinitions);
