import { pathToFileURL } from "node:url";

import { fillMessage } from "@codenhub/app-shell/messages";
import { packageDemoUrl, packageNpmUrl } from "@codenhub/app-shell/package-links";
import {
  assertSingleH1,
  buildPackageDefinitions,
  comparePublicDocuments,
  parseArchivedDocumentFrontmatter,
  parsePublicDocumentFrontmatter,
  resolvePackageDocuments,
  TRANSLATION_LOCALES,
  type PackageDefinition,
  type PackageStatus,
  type TranslationLocale,
} from "@codenhub/tools/documentation";
import type { SnapshotDocsVersions, SnapshotDocsVersionsFile } from "@codenhub/tools/release";
import type { MarkdownHeading, MarkdownInstance } from "astro";

import { defaultLocale, localizePath, messagesFor, type Locale } from "../i18n";
import { siteConfig } from "../site-config";
import { publishDocumentMarkdown } from "./document-markdown";
import { annotateCuratedLinks, applyFolderCuration } from "./folder-curation";
import { rewritePackageMarkdownLinks } from "./markdown-links";
import { rendererFor } from "./markdown/processor";
import { pageAlternates, type PageAlternate } from "./page-alternates";
import { localizeReferenceHeadings, localizeReferenceHtml } from "./reference-labels";

type PublicDocumentModule = MarkdownInstance<Record<string, unknown>>;

export type { PageAlternate } from "./page-alternates";

export interface PublicDocument {
  /**
   * Every language version of this page, itself included, and `x-default`,
   * when it has a translation; empty otherwise.
   */
  alternates: PageAlternate[];
  /**
   * The English page's route. Every page exists in every locale at this route
   * under the locale's prefix, translated or not.
   */
  englishRoute: string;
  /**
   * Language the page is written in. Under a locale prefix, `en` marks an
   * untranslated page: its body is the English one, inside the locale's interface.
   */
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
export function insertReferenceDeck(
  html: string,
  meta: { description?: string; since?: string },
  addedIn = "Added in {version}",
  lang?: string,
): string {
  const parts: string[] = [];
  if (meta.description !== undefined) {
    parts.push(`<p class="reference-summary">${escapeHtml(meta.description)}</p>`);
  }
  if (meta.since !== undefined) {
    const langAttribute = lang === undefined ? "" : ` lang="${lang}"`;
    parts.push(
      `<p class="reference-since"${langAttribute}>${fillMessage(addedIn, { version: escapeHtml(meta.since) })}</p>`,
    );
  }
  const cut = parts.length === 0 ? -1 : html.indexOf("</h1>");
  if (cut === -1) {
    return html;
  }
  const at = cut + "</h1>".length;
  return `${html.slice(0, at)}<div class="reference-deck">${parts.join("")}</div>${html.slice(at)}`;
}

/** One documented version of a package, as the version selector lists it. */
export interface PackageVersion {
  /** Whether this is the current version, served at the package's unversioned route. */
  current: boolean;
  /** English route path of every page the version publishes, so switching keeps the reader's page. */
  routePaths: ReadonlySet<string>;
  /** The version's route prefix: the package slug, then `/<version>` for an archived version. */
  routeSlug: string;
  version: string;
}

export interface PublicPackage {
  /**
   * The archived version these pages are of (`docs/specs/packages-docs-versions.md`);
   * absent for the current version. An archived package shares the current
   * one's identity: label, slug, status, and links.
   */
  archivedVersion?: string;
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
   * Each locale's pages: every published page under the locale's prefix, the
   * translation where one exists and the English body otherwise.
   */
  localeDocuments: Record<TranslationLocale, PublicDocument[]>;
  /** npm package name from the manifest. */
  name?: string;
  /** npmjs.com URL, when the package is published. */
  npmUrl?: string;
  /** Accessible label for the npm action when {@link npmUrl} is set. */
  npmLabel?: string;
  slug: string;
  status: PackageStatus;
  /**
   * The current version, then each archived one, newest first; empty when the
   * package has no archived version, since a list of one is not a choice.
   */
  versions: PackageVersion[];
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
// Archived versions exist only in the snapshot, so `astro dev` shows the
// current version alone (`docs/specs/packages-docs-versions.md`).
const ARCHIVED_ROOT = "../../.codenhub-published-docs/archived";
const archivedDocumentModulesSnapshot = import.meta.glob<PublicDocumentModule>([
  "../../.codenhub-published-docs/archived/**/docs/**/*.md",
  "!../../.codenhub-published-docs/archived/**/docs/internal/**",
]);
const archivedDocumentModules = import.meta.env.PROD ? archivedDocumentModulesSnapshot : {};
const docsVersionsSnapshot = Object.values(
  import.meta.glob<SnapshotDocsVersionsFile>("../../.codenhub-published-docs/docs-versions.json", {
    eager: true,
    import: "default",
  }),
)[0];
const docsVersions: SnapshotDocsVersionsFile = (import.meta.env.PROD ? docsVersionsSnapshot : undefined) ?? {};
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
  /** Markdown body without frontmatter, rendered again for each locale that shows it untranslated. */
  body: string;
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
  /** Language of the page it is published on, whose prefix its links to other pages keep. */
  pageLocale: Locale;
  /** Path of the English document relative to `docs/`, which a translation mirrors. */
  relativePath: string;
  routePath: string;
  sourcePath: string;
}

/** One version of a package's documents and where to load them from. */
interface VersionSource {
  /**
   * Whether this is an archived version, built leniently: frontmatter keeps
   * what it can read and the documentation checks do not run
   * (`docs/specs/packages-docs-versions.md`, "Building archived versions").
   */
  archived: boolean;
  definition: Pick<PackageDefinition, "documents" | "translations">;
  modules: Record<string, () => Promise<PublicDocumentModule>>;
  /** The version's route prefix, which its links and Markdown resolve against. */
  slug: string;
}

async function loadDocument(source: VersionSource, definition: LoadableDocument): Promise<LoadedDocument> {
  const { slug } = source;
  const load = source.modules[definition.sourcePath];
  if (load === undefined) {
    throw new Error(`Unable to load documentation source ${definition.sourcePath}.`);
  }

  const documentModule = await load();
  const headings = documentModule.getHeadings();
  const frontmatter = (source.archived ? parseArchivedDocumentFrontmatter : parsePublicDocumentFrontmatter)(
    documentModule.frontmatter,
    definition.sourcePath,
  );
  if (!source.archived) {
    assertSingleH1(headings, definition.sourcePath);
  }
  const rawHtml = await documentModule.compiledContent();

  const linkedHtml = rewritePackageMarkdownLinks(rawHtml, {
    packageSlug: slug,
    pageLocale: definition.pageLocale,
    sourceRelativePath: definition.docsPath,
  });
  const isReference = isReferenceDocument({
    relativePath: definition.relativePath,
  });
  const englishRoute = `/${slug}/${definition.routePath}`.replace(/\/$/, "") + "/";

  return {
    alternates: [],
    body: documentModule.rawContent(),
    curated: frontmatter.curated,
    date: frontmatter.date,
    description: frontmatter.description,
    group: frontmatter.group,
    englishRoute,
    headings,
    html: isReference
      ? insertReferenceDeck(linkedHtml, {
          description: frontmatter.description,
          since: frontmatter.since,
        })
      : linkedHtml,
    lang: definition.lang,
    markdown: publishDocumentMarkdown({
      body: documentModule.rawContent(),
      pageLocale: definition.pageLocale,
      relativePath: definition.docsPath,
      siteUrl: siteConfig.siteUrl,
      slug,
    }),
    order: frontmatter.order,
    rawHtml,
    relativePath: definition.relativePath,
    route: localizePath(definition.lang, englishRoute),
    routePath: definition.routePath,
    since: frontmatter.since,
    title: frontmatter.title,
  };
}

/**
 * An English document as the page it is under a locale's prefix while it has
 * no translation there: the English body, rendered again so the controls added
 * to it, its links to other pages, and a generated reference page's fixed
 * labels speak the locale. It names no `hreflang` alternates; the layout names
 * the English page as canonical instead.
 * @param english The English document.
 * @param slug The package slug.
 * @param locale The locale it is shown under.
 * @returns The page.
 */
async function untranslatedPage(
  english: LoadedDocument,
  slug: string,
  locale: TranslationLocale,
): Promise<LoadedDocument> {
  const renderer = await rendererFor(locale);
  // The path only tells the pipeline whether this is a reference page.
  const fileURL = pathToFileURL(`/packages/${slug}/docs/${english.relativePath}`);
  const rendered = await renderer.render(english.body, { fileURL });
  const messages = messagesFor(locale);
  let html = rewritePackageMarkdownLinks(rendered.code, {
    packageSlug: slug,
    pageLocale: locale,
    sourceRelativePath: english.relativePath,
  });
  let headings = rendered.metadata.headings;
  if (isReferenceDocument(english)) {
    html = insertReferenceDeck(
      localizeReferenceHtml(html, messages.reference.labels, locale),
      { description: english.description, since: english.since },
      messages.reference.addedIn,
      locale,
    );
    headings = localizeReferenceHeadings(headings, messages.reference.labels);
  }
  return {
    ...english,
    alternates: [],
    headings,
    html,
    markdown: publishDocumentMarkdown({
      body: english.body,
      pageLocale: locale,
      relativePath: english.relativePath,
      siteUrl: siteConfig.siteUrl,
      slug,
    }),
    rawHtml: rendered.code,
    route: localizePath(locale, english.englishRoute),
  };
}

/**
 * Finishes one navigation list: adds each curated index's sibling annotations,
 * drops the load-only fields, and sorts in catalog order.
 * @param loaded The list's documents, already curated.
 * @returns The published documents.
 */
function finishDocuments(loaded: readonly LoadedDocument[]): PublicDocument[] {
  const documents: PublicDocument[] = loaded.map(({ body: _body, date: _date, rawHtml: _rawHtml, ...document }) => {
    if (document.curated !== true) {
      return document;
    }
    const folder = document.relativePath.slice(0, -"index.md".length);
    // Every other document directly in the index's folder is a sibling it links.
    const siblings = loaded.filter(({ relativePath }) => {
      const rest = relativePath.slice(folder.length);
      return relativePath.startsWith(folder) && rest !== "index.md" && !rest.includes("/");
    });
    return {
      ...document,
      html: annotateCuratedLinks(document.html, siblings),
    };
  });
  return documents.sort(comparePublicDocuments);
}

/**
 * Loads one version of a package: its English pages, and every page under each locale.
 * @param source The version's documents and where they load from.
 * @returns The English pages and each locale's pages.
 */
async function loadVersion(source: VersionSource): Promise<Pick<PublicPackage, "documents" | "localeDocuments">> {
  const { definition: packageDefinition, slug } = source;
  const englishDocuments = applyFolderCuration(
    await Promise.all(
      packageDefinition.documents.map((definition) =>
        loadDocument(source, {
          ...definition,
          docsPath: definition.relativePath,
          lang: defaultLocale,
          pageLocale: defaultLocale,
        }),
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
        loadDocument(source, {
          ...definition,
          docsPath: `${definition.locale}/${definition.relativePath}`,
          lang: definition.locale,
          pageLocale: definition.locale,
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
  // Every locale publishes every page: the translation where there is one,
  // and the English body inside the locale's interface otherwise.
  const localeEntries = await Promise.all(
    TRANSLATION_LOCALES.map(async (locale) => {
      const translations = new Map(
        translatedDocuments.filter(({ lang }) => lang === locale).map((document) => [document.relativePath, document]),
      );
      // Curation sets a kept sibling's `order` from its link position in the
      // English index, so the translation takes the English page's place.
      const pages = await Promise.all(
        englishDocuments.map((english) => {
          const translation = translations.get(english.relativePath);
          return translation === undefined
            ? untranslatedPage(english, slug, locale)
            : { ...translation, order: english.order };
        }),
      );
      return [locale, finishDocuments(pages)] as const;
    }),
  );
  const localeDocuments = Object.fromEntries(localeEntries) as Record<TranslationLocale, PublicDocument[]>;
  return { documents, localeDocuments };
}

async function loadCatalog(): Promise<PublicPackage[]> {
  return Promise.all(
    packageDefinitions.map(async (packageDefinition) => {
      const { slug } = packageDefinition;
      const { documents, localeDocuments } = await loadVersion({
        archived: false,
        definition: packageDefinition,
        modules: documentModules,
        slug,
      });

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
        versions: [],
      };
    }),
  );
}

/**
 * Builds a package's archived versions, leaving out each one that cannot be built.
 *
 * A tag cannot be fixed, so a version that still fails after lenient loading
 * is dropped with a warning naming the package, the version, and the error,
 * and its URLs redirect as for a release that is not kept
 * (`docs/specs/packages-docs-versions.md`, "Building archived versions").
 * @param currentPackage The package's current version, whose identity every archived version shares.
 * @param entry The package's versions in the snapshot.
 * @returns Each archived version that built, newest first.
 */
async function loadArchivedVersions(
  currentPackage: PublicPackage,
  entry: SnapshotDocsVersions,
): Promise<PublicPackage[]> {
  const sourcePaths = Object.keys(archivedDocumentModules);
  const loaded = await Promise.all(
    entry.archived.map(async (version): Promise<PublicPackage | undefined> => {
      const routeSlug = `${currentPackage.slug}/${version}`;
      const rootPath = `${ARCHIVED_ROOT}/${entry.location}/${version}`;
      try {
        const definition = resolvePackageDocuments(rootPath, sourcePaths, {
          label: currentPackage.label,
          manifestPath: `${rootPath}/package.json`,
          slug: routeSlug,
        });
        const pages = await loadVersion({
          archived: true,
          definition,
          modules: archivedDocumentModules,
          slug: routeSlug,
        });
        return { ...currentPackage, ...pages, archivedVersion: version };
      } catch (error) {
        console.warn(
          `Left out the archived docs of ${currentPackage.name ?? currentPackage.slug}@${version}: ${(error as Error).message}`,
        );
        return undefined;
      }
    }),
  );
  return loaded.filter((archived) => archived !== undefined);
}

/**
 * The selector's list for a package: its current version, then each archived one.
 * @param currentPackage The current version.
 * @param currentVersion The current version's number.
 * @param archived The archived versions that built, newest first.
 * @returns The versions, or none when nothing is archived.
 */
function listVersions(
  currentPackage: PublicPackage,
  currentVersion: string,
  archived: readonly PublicPackage[],
): PackageVersion[] {
  if (archived.length === 0) {
    return [];
  }
  const describe = (publicPackage: PublicPackage, version: string, current: boolean): PackageVersion => ({
    current,
    routePaths: new Set(publicPackage.documents.map(({ routePath }) => routePath)),
    routeSlug: current ? publicPackage.slug : `${publicPackage.slug}/${version}`,
    version,
  });
  return [
    describe(currentPackage, currentVersion, true),
    ...archived.map((publicPackage) => describe(publicPackage, publicPackage.archivedVersion as string, false)),
  ];
}

/**
 * The route of a page in another version of its package.
 * @param version The version to open.
 * @param routePath The page's English route path.
 * @param locale The page's language, whose prefix the route keeps.
 * @returns The same page in that version, or that version's index when it has no such page.
 */
export function versionRoute(version: PackageVersion, routePath: string, locale: Locale): string {
  const path = version.routePaths.has(routePath) ? routePath : "";
  return localizePath(locale, `/${version.routeSlug}/${path}`.replace(/\/$/, "") + "/");
}

/**
 * The pages a package publishes in a page language, which its navigation lists.
 * @param publicPackage The package.
 * @param locale The page's language.
 * @returns The locale's pages.
 */
export function navigationDocuments(publicPackage: PublicPackage, locale: Locale): PublicDocument[] {
  return locale === defaultLocale ? publicPackage.documents : publicPackage.localeDocuments[locale];
}

/**
 * Every page a package publishes, each with the language of its interface.
 *
 * Every page is listed once per language: in English, and under each locale,
 * translated or with its English body. A page whose `lang` differs from its
 * locale is untranslated.
 * @param publicPackage The package.
 * @returns Each page and its interface language.
 */
export function publishedPages(publicPackage: PublicPackage): { document: PublicDocument; locale: Locale }[] {
  return [
    ...publicPackage.documents.map((document) => ({
      document,
      locale: defaultLocale as Locale,
    })),
    ...TRANSLATION_LOCALES.flatMap((locale) =>
      publicPackage.localeDocuments[locale].map((document) => ({
        document,
        locale: locale as Locale,
      })),
    ),
  ];
}

const packageDefinitions = buildPackageDefinitions(manifestModules, Object.keys(documentModules));

const currentPackages = await loadCatalog();

/** What the not-found page needs to send each release the site does not serve to one it does. */
export interface VersionRedirectSource {
  /** Archived versions that built. */
  archived: string[];
  current: string;
  slug: string;
  /** Every released version, pre-releases included. */
  versions: string[];
}

const archivedEntries = await Promise.all(
  currentPackages.map(async (currentPackage) => {
    const entry = currentPackage.name === undefined ? undefined : docsVersions[currentPackage.name];
    return entry === undefined
      ? undefined
      : {
          archived: await loadArchivedVersions(currentPackage, entry),
          currentPackage,
          entry,
        };
  }),
);

/** The current version of every documented package. Search, the sitemap, and the root `llms.txt` list only these. */
export const packages: PublicPackage[] = currentPackages.map((currentPackage) => {
  const found = archivedEntries.find((archived) => archived?.currentPackage === currentPackage);
  return found === undefined
    ? currentPackage
    : {
        ...currentPackage,
        versions: listVersions(currentPackage, found.entry.current, found.archived),
      };
});

/** Every archived version that built, each with its package's version list. Rendered, but never indexed. */
export const archivedPackages: PublicPackage[] = archivedEntries.flatMap((found) => {
  if (found === undefined) {
    return [];
  }
  const versions = listVersions(found.currentPackage, found.entry.current, found.archived);
  return found.archived.map((archived) => ({ ...archived, versions }));
});

/** Each package with versions in the snapshot, for version redirects; empty outside a production build. */
export const versionRedirectSources: VersionRedirectSource[] = archivedEntries.flatMap((found) =>
  found === undefined
    ? []
    : [
        {
          archived: found.archived.map(({ archivedVersion }) => archivedVersion as string),
          current: found.entry.current,
          slug: found.currentPackage.slug,
          versions: found.entry.versions,
        },
      ],
);
