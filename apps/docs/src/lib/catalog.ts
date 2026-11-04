import { packageDemoUrl, packageNpmUrl } from "@codenhub/app-shell/package-links";
import {
  assertSingleH1,
  buildPackageDefinitions,
  comparePublicDocuments,
  parsePublicDocumentFrontmatter,
  TRANSLATION_LOCALES,
  type PackageStatus,
  type TranslationLocale,
} from "@codenhub/tools/documentation";
import type { MarkdownHeading, MarkdownInstance } from "astro";

import { defaultLocale, localizePath, type Locale } from "../i18n";
import { siteConfig } from "../site-config";
import { publishDocumentMarkdown } from "./document-markdown";
import { annotateCuratedLinks, applyFolderCuration } from "./folder-curation";
import { rewritePackageMarkdownLinks } from "./markdown-links";
import { pageAlternates, type PageAlternate } from "./page-alternates";

type PublicDocumentModule = MarkdownInstance<Record<string, unknown>>;

export type { PageAlternate } from "./page-alternates";

export interface PublicDocument {
  /**
   * Every language version of this page, itself included, and `x-default`,
   * when it has a translation; empty otherwise.
   */
  alternates: PageAlternate[];
  /** Language the page is written in. */
  lang: Locale;
  /** Whether this is a curated folder's overview page, which lists its published siblings. */
  curated?: boolean;
  description?: string;
  /** Section label from a folder `index.md`, when it sets one. */
  group?: string;
  headings: MarkdownHeading[];
  html: string;
  /** Markdown body without frontmatter, published beside the page as `index.md`, with site links made absolute. */
  markdown: string;
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
  /** Scoped `demo.codenhub.dev` URL, only when this package publishes a `demo/`. */
  demoUrl?: string;
  /** GitHub URL from the package's manifest `homepage`, when it points there. */
  githubUrl?: string;
  /** Accessible label for the GitHub action when {@link githubUrl} is set. */
  githubLabel?: string;
  label: string;
  /**
   * Each locale's navigation list, for a locale the package has at least one
   * translation in: every published page, translated where a translation exists
   * and English otherwise.
   */
  localeDocuments: Partial<Record<TranslationLocale, PublicDocument[]>>;
  /** npm package name from the manifest. */
  name?: string;
  /** npmjs.com URL, when the package is published. */
  npmUrl?: string;
  /** Accessible label for the npm action when {@link npmUrl} is set. */
  npmLabel?: string;
  slug: string;
  status: PackageStatus;
}

// Two roots, chosen by `import.meta.env.PROD`: `astro dev` keeps reading the
// working tree directly, so editing a package's docs locally still
// hot-reloads. A production build reads `.codenhub-published-docs` instead,
// which `published-docs-snapshot-integration.ts` populates before Vite scans
// these globs — it holds only released packages, each exactly as it was at its
// latest release tag, so an unreleased package or change never reaches here.
// (docs/ci.md, "The documentation site")
const manifestModulesLive = import.meta.glob<unknown>("../../../../packages/**/package.json", {
  eager: true,
  import: "default",
});
const manifestModulesSnapshot = import.meta.glob<unknown>("../../.codenhub-published-docs/packages/**/package.json", {
  eager: true,
  import: "default",
});
const manifestModules = import.meta.env.PROD ? manifestModulesSnapshot : manifestModulesLive;

const documentModulesLive = import.meta.glob<PublicDocumentModule>([
  "../../../../packages/**/docs/**/*.md",
  "!../../../../packages/**/docs/internal/**",
]);
const documentModulesSnapshot = import.meta.glob<PublicDocumentModule>([
  "../../.codenhub-published-docs/packages/**/docs/**/*.md",
  "!../../.codenhub-published-docs/packages/**/docs/internal/**",
]);
const documentModules = import.meta.env.PROD ? documentModulesSnapshot : documentModulesLive;
// Keys only: whether a package has a `demo/` at all is enough to decide
// whether its scoped Demo link exists; the aggregator contract in
// `docs/specs/packages-demo.md` is what actually mounts it.
const demoManifestPaths = new Set(
  Object.keys(import.meta.glob("../../../../packages/*/demo/package.json")).map(
    (manifestPath) => /\/packages\/([^/]+)\/demo\/package\.json$/.exec(manifestPath)?.[1],
  ),
);

function readManifestString(manifest: unknown, key: string): string | undefined {
  if (typeof manifest !== "object" || manifest === null) {
    return undefined;
  }
  const value = (manifest as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

interface LoadedDocument extends PublicDocument {
  /** Release date of a changelog version page, used only to annotate its curated index. */
  date?: string;
  /** Compiled HTML before local links are rewritten, used only to resolve curated-folder links. */
  rawHtml: string;
}

interface LoadableDocument {
  /** Path relative to the package `docs/`, the locale folder included for a translation. */
  docsPath: string;
  /** Language the document is written in. */
  lang: Locale;
  /** Path of the English document relative to `docs/`, which a translation mirrors. */
  relativePath: string;
  routePath: string;
  sourcePath: string;
}

async function loadDocument(slug: string, definition: LoadableDocument): Promise<LoadedDocument> {
  const load = documentModules[definition.sourcePath];
  if (load === undefined) {
    throw new Error(`Unable to load documentation source ${definition.sourcePath}.`);
  }

  const documentModule = await load();
  const headings = documentModule.getHeadings();
  const frontmatter = parsePublicDocumentFrontmatter(documentModule.frontmatter, definition.sourcePath);
  assertSingleH1(headings, definition.sourcePath);
  const rawHtml = await documentModule.compiledContent();

  const linkedHtml = rewritePackageMarkdownLinks(rawHtml, {
    packageSlug: slug,
    sourceRelativePath: definition.docsPath,
  });
  const isReference = isReferenceDocument({ relativePath: definition.relativePath });

  return {
    alternates: [],
    curated: frontmatter.curated,
    date: frontmatter.date,
    description: frontmatter.description,
    group: frontmatter.group,
    headings,
    html: isReference
      ? insertReferenceDeck(linkedHtml, { description: frontmatter.description, since: frontmatter.since })
      : linkedHtml,
    lang: definition.lang,
    markdown: publishDocumentMarkdown({
      body: documentModule.rawContent(),
      relativePath: definition.docsPath,
      siteUrl: siteConfig.siteUrl,
      slug,
    }),
    order: frontmatter.order,
    rawHtml,
    relativePath: definition.relativePath,
    route: `${localizePath(definition.lang, `/${slug}`)}/${definition.routePath}`.replace(/\/$/, "") + "/",
    routePath: definition.routePath,
    since: frontmatter.since,
    title: frontmatter.title,
  };
}

/**
 * Finishes one navigation list: adds each curated index's sibling annotations,
 * drops the load-only fields, and sorts in catalog order.
 * @param loaded The list's documents, already curated.
 * @returns The published documents.
 */
function finishDocuments(loaded: readonly LoadedDocument[]): PublicDocument[] {
  const documents: PublicDocument[] = loaded.map(({ date: _date, rawHtml: _rawHtml, ...document }) => {
    if (document.curated !== true) {
      return document;
    }
    const folder = document.relativePath.slice(0, -"index.md".length);
    // Every other document directly in the index's folder is a sibling it links.
    const siblings = loaded.filter(({ relativePath }) => {
      const rest = relativePath.slice(folder.length);
      return relativePath.startsWith(folder) && rest !== "index.md" && !rest.includes("/");
    });
    return { ...document, html: annotateCuratedLinks(document.html, siblings) };
  });
  return documents.sort(comparePublicDocuments);
}

async function loadCatalog(): Promise<PublicPackage[]> {
  return Promise.all(
    packageDefinitions.map(async (packageDefinition) => {
      const { slug } = packageDefinition;
      const englishDocuments = applyFolderCuration(
        await Promise.all(
          packageDefinition.documents.map((definition) =>
            loadDocument(slug, { ...definition, docsPath: definition.relativePath, lang: defaultLocale }),
          ),
        ),
      );
      // Curation is the English document's: a translation of a page the English
      // curated index leaves out is not published either.
      const publishedPaths = new Set(englishDocuments.map(({ relativePath }) => relativePath));
      const translatedDocuments = await Promise.all(
        packageDefinition.translations
          .filter(({ relativePath }) => publishedPaths.has(relativePath))
          .map((definition) =>
            loadDocument(slug, {
              ...definition,
              docsPath: `${definition.locale}/${definition.relativePath}`,
              lang: definition.locale,
            }),
          ),
      );

      // Each version of a page names every version, itself included, as an alternate.
      for (const english of englishDocuments) {
        const translations = translatedDocuments.filter(({ relativePath }) => relativePath === english.relativePath);
        const alternates = pageAlternates(english, translations);
        for (const version of [english, ...translations]) {
          version.alternates = alternates;
        }
      }

      const documents = finishDocuments(englishDocuments);
      // A locale's navigation lists every published page, the translation where
      // there is one and the English page otherwise.
      const localeDocuments: Partial<Record<TranslationLocale, PublicDocument[]>> = {};
      for (const locale of TRANSLATION_LOCALES) {
        const translations = new Map(
          translatedDocuments
            .filter(({ lang }) => lang === locale)
            .map((document) => [document.relativePath, document]),
        );
        if (translations.size > 0) {
          // Curation sets a kept sibling's `order` from its link position in the
          // English index, so the translation takes the English page's place.
          localeDocuments[locale] = finishDocuments(
            englishDocuments.map((english) => {
              const translation = translations.get(english.relativePath);
              return translation === undefined ? english : { ...translation, order: english.order };
            }),
          );
        }
      }

      const manifest = manifestModules[packageDefinition.manifestPath];
      const name = readManifestString(manifest, "name");
      const homepage = readManifestString(manifest, "homepage");
      const githubUrl = homepage?.startsWith("https://github.com/") === true ? homepage : undefined;
      const npmUrl = name === undefined ? undefined : packageNpmUrl(name);

      return {
        demoUrl:
          siteConfig.demoUrl !== undefined && demoManifestPaths.has(packageDefinition.slug)
            ? packageDemoUrl(siteConfig.demoUrl, packageDefinition.slug)
            : undefined,
        description: packageDefinition.description,
        documents,
        localeDocuments,
        githubLabel: githubUrl === undefined ? undefined : `${name} on GitHub`,
        githubUrl,
        label: packageDefinition.label,
        name,
        npmLabel: npmUrl === undefined ? undefined : `${name} on npm`,
        npmUrl,
        slug,
        status: packageDefinition.status,
      };
    }),
  );
}

/**
 * The documents a package's navigation lists in a page language.
 * @param publicPackage The package.
 * @param locale The page's language.
 * @returns The locale's list, or the English documents for English or a locale the package has no translation in.
 */
export function navigationDocuments(publicPackage: PublicPackage, locale: Locale): PublicDocument[] {
  return locale === defaultLocale
    ? publicPackage.documents
    : (publicPackage.localeDocuments[locale] ?? publicPackage.documents);
}

/**
 * Every page a package publishes, each with the language its navigation is shown in.
 *
 * English pages are listed once, in English. A translated page is listed under
 * its own locale; a locale route exists only for a translated document.
 * @param publicPackage The package.
 * @returns Each page and its interface language.
 */
export function publishedPages(publicPackage: PublicPackage): { document: PublicDocument; locale: Locale }[] {
  return [
    ...publicPackage.documents.map((document) => ({ document, locale: defaultLocale as Locale })),
    ...Object.entries(publicPackage.localeDocuments).flatMap(([locale, documents]) =>
      (documents ?? [])
        .filter((document) => document.lang === locale)
        .map((document) => ({ document, locale: locale as Locale })),
    ),
  ];
}

const packageDefinitions = buildPackageDefinitions(manifestModules, Object.keys(documentModules));

export const packages = await loadCatalog();
