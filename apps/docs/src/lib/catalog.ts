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
  /** Version an entrypoint first shipped in, from a generated reference page's `since`. */
  since?: string;
  title: string;
}

/**
 * Whether a document is a page in a package's generated `docs/reference/` area.
 *
 * Matches the `reference/` directory only. A hand-authored `docs/reference.md`
 * (a file, in a package with no generated reference) is an ordinary page.
 */
export function isReferenceDocument(document: Pick<PublicDocument, "relativePath">): boolean {
  return document.relativePath.startsWith("reference/");
}

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * Splices a generated reference page's `description` and `since` in as a deck
 * directly below the H1.
 *
 * This is the one place the site adds to a rendered document body rather than
 * only to page chrome: both values are generator-derived and read as part of the
 * entrypoint heading they sit under. `docs/specs/packages-documentation.md`
 * carves this out for `docs/reference/` pages.
 */
export function insertReferenceDeck(html: string, meta: { description?: string; since?: string }): string {
  const parts: string[] = [];
  if (meta.description !== undefined) {
    parts.push(`<p class="reference-summary">${escapeHtml(meta.description)}</p>`);
  }
  if (meta.since !== undefined) {
    parts.push(`<p class="reference-since">Added in ${escapeHtml(meta.since)}</p>`);
  }
  const cut = parts.length === 0 ? -1 : html.indexOf("</h1>");
  if (cut === -1) {
    return html;
  }
  const at = cut + "</h1>".length;
  return `${html.slice(0, at)}<div class="reference-deck">${parts.join("")}</div>${html.slice(at)}`;
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

          const linkedHtml = rewritePackageMarkdownLinks(rawHtml, {
            packageSlug: packageDefinition.slug,
            sourceRelativePath: definition.relativePath,
          });
          const isReference = isReferenceDocument({ relativePath: definition.relativePath });

          return {
            curated: frontmatter.curated,
            description: frontmatter.description,
            group: frontmatter.group,
            headings,
            html: isReference
              ? insertReferenceDeck(linkedHtml, { description: frontmatter.description, since: frontmatter.since })
              : linkedHtml,
            order: frontmatter.order,
            rawHtml,
            relativePath: definition.relativePath,
            route: `/${packageDefinition.slug}/${definition.routePath}`.replace(/\/$/, "") + "/",
            routePath: definition.routePath,
            since: frontmatter.since,
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

export const packages = await loadCatalog();

/**
 * Catalog summaries for the landing page: every published package, listed or
 * not, with its label, description, status, and documentation route. The rich
 * cross-linked catalog lives on `apps/www`; this list only routes into the docs
 * site itself.
 */
export const publicPackages: PublicPackageSummary[] = buildPublicPackageSummaries(manifestModules, packageDefinitions);
