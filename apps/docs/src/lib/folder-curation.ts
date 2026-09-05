const LOCAL_HREF = /(?:href|src)=(['"])([^'"]+)\1/g;

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
 * Extracts local link targets from compiled HTML, in document order.
 * @param html Compiled HTML of one document.
 * @returns Every `href`/`src` attribute value found, including duplicates.
 */
function extractLinkTargets(html: string): string[] {
  return [...html.matchAll(LOCAL_HREF)].map((match) => match[2]!);
}

/**
 * Reduces a link target to the filename a sibling document can be matched
 * against, stripping a leading `./`, and any query string or fragment.
 * @param target Raw `href`/`src` attribute value.
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
 * A folder without a curated index page is returned unchanged, so this has no
 * effect on any other folder in the workspace.
 * @param documents One package's public documents, unfiltered.
 * @returns The same documents, minus each curated folder's unlinked siblings, with kept siblings reordered to match their curated index's link order.
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
