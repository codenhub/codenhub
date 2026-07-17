import type { MarkdownHeading, MarkdownInstance } from "astro";

import { buildPackageDefinitions, type PackageStatus } from "./catalog-core";
import { rewritePackageMarkdownLinks } from "./markdown-links";

type PublicDocumentModule = MarkdownInstance<Record<string, unknown>>;

export interface PublicDocument {
  description?: string;
  headings: MarkdownHeading[];
  html: string;
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

const manifestModules = import.meta.glob<unknown>("../../../../packages/**/package.json", {
  eager: true,
  import: "default",
});
const documentModules = import.meta.glob<PublicDocumentModule>([
  "../../../../packages/**/docs/**/*.md",
  "!../../../../packages/**/docs/internal/**",
]);

function readOptionalFrontmatterText(
  frontmatter: Record<string, unknown>,
  field: "description" | "title",
  sourcePath: string,
): string | undefined {
  const value = frontmatter[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid ${field} frontmatter in ${sourcePath}: expected a non-empty string.`);
  }
  return value;
}

function readDocumentOrder(frontmatter: Record<string, unknown>, sourcePath: string): number | undefined {
  const value = frontmatter.order;
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Invalid order frontmatter in ${sourcePath}: expected a non-negative integer.`);
  }
  return value as number;
}

async function loadCatalog(): Promise<PublicPackage[]> {
  const definitions = buildPackageDefinitions(manifestModules, Object.keys(documentModules));

  return Promise.all(
    definitions.map(async (packageDefinition) => {
      const documents = await Promise.all(
        packageDefinition.documents.map(async (definition): Promise<PublicDocument> => {
          const loadDocument = documentModules[definition.sourcePath];
          if (loadDocument === undefined) {
            throw new Error(`Unable to load documentation source ${definition.sourcePath}.`);
          }

          const documentModule = await loadDocument();
          const headings = documentModule.getHeadings();
          const frontmatter = documentModule.frontmatter;
          const title =
            readOptionalFrontmatterText(frontmatter, "title", definition.sourcePath) ??
            headings.find(({ depth }) => depth === 1)?.text;

          if (title === undefined) {
            throw new Error(`Missing H1 or title frontmatter in ${definition.sourcePath}.`);
          }

          return {
            description: readOptionalFrontmatterText(frontmatter, "description", definition.sourcePath),
            headings,
            html: rewritePackageMarkdownLinks(await documentModule.compiledContent(), {
              packageSlug: packageDefinition.slug,
              sourceRelativePath: definition.relativePath,
            }),
            order: readDocumentOrder(frontmatter, definition.sourcePath),
            relativePath: definition.relativePath,
            route: `/${packageDefinition.slug}/${definition.routePath}`.replace(/\/$/, "") + "/",
            routePath: definition.routePath,
            title,
          };
        }),
      );

      documents.sort(
        (left, right) =>
          (left.routePath === "" ? -1 : 0) - (right.routePath === "" ? -1 : 0) ||
          (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
          left.relativePath.localeCompare(right.relativePath),
      );

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

export const packages = await loadCatalog();
