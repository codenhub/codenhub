const ANCHOR_HREF = /<a\b[^>]*\bhref=(['"])([^'"]+)\1[^>]*>/gi;

/** A document's fields relevant to curated-folder membership and ordering. */
export interface CuratableDocument {
  /** Whether this document is a folder's curated entrypoint. Ignored on every other document. */
  curated?: boolean;
  /** Explicit sidebar position, overridden for a curated folder's kept siblings. */
  order?: number;
  /** Compiled HTML before local links are rewritten, scanned only on a curated index. */
  rawHtml: string;
  /** Path relative to the package `docs/` directory. */
  relativePath: string;
}

function folderSegment(relativePath: string): string | undefined {
  const separator = relativePath.lastIndexOf("/");
  return separator === -1 ? undefined : relativePath.slice(0, separator);
}

function basename(relativePath: string): string {
  const separator = relativePath.lastIndexOf("/");
  return separator === -1 ? relativePath : relativePath.slice(separator + 1);
}

/**
 * Extracts navigational anchor link targets from compiled HTML, in document
 * order. Resource attributes such as an image `src` are deliberately not a
 * membership signal — only an `<a href>` counts as the index page linking to
 * a sibling.
 * @param html Compiled HTML of one document.
 * @returns Every `<a href>` attribute value found, including duplicates.
 */
function extractLinkTargets(html: string): string[] {
  return [...html.matchAll(ANCHOR_HREF)].map((match) => match[2]!);
}

/**
 * Reduces a link target to the filename a sibling document can be matched
 * against, stripping a leading `./`, and any query string or fragment.
 * @param target Raw `href` attribute value.
 * @returns The bare filename the target points at.
 */
function normalizeLinkTarget(target: string): string {
  return target.replace(/^\.\//, "").replace(/[?#].*$/, "");
}

/**
 * Applies curated-folder membership: a folder whose `index.md` sets
 * `curated: true` publishes only the sibling documents it links to, in that
 * link order, instead of every document physically present in the folder.
 *
 * The curated `index.md` names what to publish and is kept as the folder's
 * overview page; {@link annotateCuratedLinks} adds each entry's date and
 * description to it (`docs/specs/packages-changelog.md`,
 * `docs/specs/packages-documentation.md`). A folder without a curated index page
 * is returned unchanged, so this has no effect on any other folder in the
 * workspace.
 * @param documents One package's public documents, unfiltered.
 * @returns The same documents, minus every curated folder's unlinked siblings, with each curated index followed by its kept siblings in link order.
 */
export function applyFolderCuration<T extends CuratableDocument>(documents: readonly T[]): T[] {
  const rootDocuments: T[] = [];
  const folderDocuments = new Map<string, T[]>();
  const folderSegments: string[] = [];

  for (const document of documents) {
    const segment = folderSegment(document.relativePath);
    if (segment === undefined) {
      rootDocuments.push(document);
      continue;
    }
    const bucket = folderDocuments.get(segment);
    if (bucket === undefined) {
      folderDocuments.set(segment, [document]);
      folderSegments.push(segment);
    } else {
      bucket.push(document);
    }
  }

  const result: T[] = [...rootDocuments];
  for (const segment of folderSegments) {
    const bucket = folderDocuments.get(segment) ?? [];
    const indexDocument = bucket.find((document) => document.relativePath === `${segment}/index.md`);
    if (indexDocument?.curated !== true) {
      result.push(...bucket);
      continue;
    }

    const siblingsByName = new Map(
      bucket
        .filter((document) => document !== indexDocument)
        .map((document) => [basename(document.relativePath), document]),
    );
    const linkedNames = new Set<string>();
    for (const target of extractLinkTargets(indexDocument.rawHtml)) {
      linkedNames.add(normalizeLinkTarget(target));
    }

    // The curated index leads as the folder's overview page, followed by only
    // the siblings it links to.
    result.push(indexDocument);
    let position = 0;
    for (const name of linkedNames) {
      const sibling = siblingsByName.get(name);
      if (sibling !== undefined) {
        result.push({ ...sibling, order: position });
        position += 1;
      }
    }
  }

  return result;
}

/** A published sibling of a curated index, as its overview page lists it. */
export interface CuratedEntry {
  /** Release date, as an ISO `YYYY-MM-DD` string, when the page sets one. */
  date?: string;
  description?: string;
  /** Site route the curated index's rewritten link points at. */
  route: string;
}

const ANCHOR_ELEMENT = /<a\b[^>]*\bhref=(['"])([^'"]+)\1[^>]*>[\s\S]*?<\/a>/gi;

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Fixed locale and UTC, so a build renders the same words on every machine and
// a `YYYY-MM-DD` date never shifts a day with the builder's time zone.
const RELEASE_DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

/** Spells an ISO `YYYY-MM-DD` date out for readers, as in "October 7, 2026". */
function formatReleaseDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? isoDate : RELEASE_DATE_FORMAT.format(parsed);
}

/**
 * Adds each linked entry's date and description right after its link in a
 * curated index page, so the overview says when each version shipped and what
 * it changed without the author repeating that in `index.md`.
 *
 * Only the first link to each entry is annotated; links to anything else are
 * left as authored.
 * @param html Rendered index HTML, with links already rewritten to site routes.
 * @param entries The siblings the index publishes.
 * @returns The HTML with each entry's details inserted after its first link.
 */
export function annotateCuratedLinks(html: string, entries: readonly CuratedEntry[]): string {
  const pending = new Map(entries.map((entry) => [entry.route, entry]));
  return html.replace(ANCHOR_ELEMENT, (anchor: string, _quote: string, href: string) => {
    const route = href.replace(/[?#].*$/, "");
    const entry = pending.get(route);
    if (entry === undefined) {
      return anchor;
    }
    pending.delete(route);
    const date =
      entry.date === undefined
        ? ""
        : ` <span class="curated-entry-date">Released on <time datetime="${escapeHtml(entry.date)}">${escapeHtml(formatReleaseDate(entry.date))}</time></span>`;
    const description =
      entry.description === undefined
        ? ""
        : `<p class="curated-entry-description">${escapeHtml(entry.description)}</p>`;
    return `${anchor}${date}${description}`;
  });
}
