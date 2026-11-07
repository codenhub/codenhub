import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { execute } from "../process/execute.ts";
import { resolveLocalPath, type DocumentGraph } from "./document-graph.ts";
import {
  UnsupportedFrontmatterError,
  coercePublicDocumentCurated,
  coercePublicDocumentOrder,
  parseMarkdown,
} from "./document-policy.ts";
import { listPackageFiles } from "./package-documentation.ts";
import {
  TRANSLATION_LOCALES,
  isTranslationLocale,
  parseTranslationPath,
  translatedPathOf,
  type TranslationPath,
} from "./translation-paths.ts";

/** A translation problem, as `docs/specs/packages-translations.md` "Validation" lists them. */
export interface TranslationIssue {
  /** Machine-readable problem kind. */
  code:
    | "english-link"
    | "invalid-source"
    | "missing-english"
    | "stale"
    | "structure-mismatch"
    | "unsupported-locale"
    | "untranslatable-area";
  /** `error` for what the spec forbids, `warning` for what it only reports. */
  severity: "error" | "warning";
  /** Human-readable explanation. */
  message: string;
  /** Package-relative translation path, or the locale area, the problem belongs to. */
  sourcePath: string;
  /** Link target or English path the problem refers to. */
  target?: string;
}

/** A package file recognized as a translation, with its own path. */
export interface TranslationFile extends TranslationPath {
  /** Package-relative POSIX path of the translation. */
  packagePath: string;
}

const BLOB_ID = /^[0-9a-f]{40}$/i;
const README_SOURCE = /^<!--\s*source:\s*(?<id>\S*)\s*-->/;
const BYTE_ORDER_MARK = "﻿";
// Areas a translation never reaches a reader in, per the spec's "What is
// translated": generated or never-maintained pages, and unpublished ones.
const UNTRANSLATABLE_AREAS = ["reference", "changelog", "internal"] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//");
}

/**
 * Lists every file recognized as a translation by its path.
 * @param files Package-relative POSIX paths.
 * @returns Translations in path order, listed locale or not.
 */
export function listTranslations(files: Iterable<string>): TranslationFile[] {
  return [...files]
    .flatMap((packagePath) => {
      const translation = parseTranslationPath(packagePath);
      return translation === undefined ? [] : [{ ...translation, packagePath }];
    })
    .sort((left, right) => compareText(left.packagePath, right.packagePath));
}

/** Whether a translation carries a `source`: a translated README or a translated Markdown document. */
function carriesSource(translation: TranslationFile): boolean {
  return translation.kind === "readme" || translation.packagePath.endsWith(".md");
}

/**
 * Reads the blob ID a translation records as its `source`.
 *
 * A translated document records it in its frontmatter; a translated README, which
 * cannot carry frontmatter, in an HTML comment on its first line.
 * @param translation Translation the contents belong to.
 * @param contents Raw file contents.
 * @returns The value as written, or `undefined` when there is none.
 */
export function readTranslationSource(translation: TranslationPath, contents: string): string | undefined {
  const text = contents.startsWith(BYTE_ORDER_MARK) ? contents.slice(BYTE_ORDER_MARK.length) : contents;
  if (translation.kind === "readme") {
    return README_SOURCE.exec(text.split(/\r?\n/, 1)[0] ?? "")?.groups?.id || undefined;
  }
  try {
    const value = parseMarkdown(text, translation.englishPath).frontmatter.source;
    return typeof value === "string" && value !== "" ? value : undefined;
  } catch (cause) {
    // The documentation rule reports frontmatter it cannot read.
    if (cause instanceof UnsupportedFrontmatterError) {
      return undefined;
    }
    throw cause;
  }
}

/**
 * Reports whether a `source` value has the shape of a git blob ID.
 * @param source Value as written.
 * @returns True for 40 hexadecimal characters.
 */
export function isBlobId(source: string | undefined): source is string {
  return source !== undefined && BLOB_ID.test(source);
}

function untranslatableArea(translation: TranslationFile): string | undefined {
  if (translation.kind !== "document") {
    return undefined;
  }
  const area = UNTRANSLATABLE_AREAS.find((name) => translation.englishPath.startsWith(`docs/${name}/`));
  return area === undefined ? undefined : `docs/${translation.locale}/${area}/`;
}

function localeArea(translation: TranslationFile): string {
  return translation.kind === "readme" ? translation.packagePath : `docs/${translation.locale}/`;
}

function addStructureIssues(
  graph: DocumentGraph,
  translation: TranslationFile,
  isStale: boolean,
  issues: TranslationIssue[],
): void {
  const translated = graph.documents.find(({ path }) => path === translation.packagePath);
  const english = graph.documents.find(({ path }) => path === translation.englishPath);
  if (translated === undefined || english === undefined || translation.kind !== "document") {
    return;
  }
  const fields = [["order", coercePublicDocumentOrder] as const, ["curated", coercePublicDocumentCurated] as const];
  for (const [field, coerce] of fields) {
    const [ours, theirs] = [coerce(translated.frontmatter[field]), coerce(english.frontmatter[field])];
    if (ours !== theirs) {
      issues.push({
        code: "structure-mismatch",
        message: `${field} is ${String(ours)} here but ${String(theirs)} in ${translation.englishPath}; a translation cannot reorder or reshape what the English publishes.`,
        severity: "error",
        sourcePath: translation.packagePath,
        target: translation.englishPath,
      });
    }
  }
  const headingIssue = describeHeadingMismatch(translated.headings, english.headings, translation.englishPath);
  // A stale translation may trail the English's headings until it is updated,
  // as it may trail its text: only a current one is published.
  if (headingIssue !== undefined) {
    issues.push({
      code: "structure-mismatch",
      message: `${headingIssue}; the documentation site matches an English section link to the translated section by heading position.`,
      severity: isStale ? "warning" : "error",
      sourcePath: translation.packagePath,
      target: translation.englishPath,
    });
  }
}

function describeHeadingMismatch(
  ours: readonly { depth: number }[],
  theirs: readonly { depth: number }[],
  englishPath: string,
): string | undefined {
  const index = ours.findIndex(({ depth }, position) => depth !== theirs[position]?.depth);
  if (index !== -1 && index < theirs.length) {
    return `heading ${index + 1} is an H${ours[index]!.depth} here but an H${theirs[index]!.depth} in ${englishPath}`;
  }
  return ours.length === theirs.length
    ? undefined
    : `${ours.length} headings here but ${theirs.length} in ${englishPath}`;
}

function addEnglishLinkIssues(graph: DocumentGraph, translation: TranslationFile, issues: TranslationIssue[]): void {
  const document = graph.documents.find(({ path }) => path === translation.packagePath);
  for (const { target } of document?.links ?? []) {
    if (isExternalTarget(target)) {
      continue;
    }
    const resolved = resolveLocalPath(translation.packagePath, target).path;
    if (resolved === undefined || parseTranslationPath(resolved) !== undefined) {
      continue;
    }
    const translated = translatedPathOf(resolved, translation.locale);
    if (translated !== undefined && translated !== resolved && graph.files.has(translated)) {
      issues.push({
        code: "english-link",
        message: `Links the English ${resolved}, which has a ${translation.locale} translation at ${translated}; link the translation.`,
        severity: "warning",
        sourcePath: translation.packagePath,
        target,
      });
    }
  }
}

/**
 * Validates a package's translations against `docs/specs/packages-translations.md`,
 * except for staleness, which needs git and is judged by {@link findStaleTranslations}.
 *
 * A translation in an unlisted locale, or in an area that is never translated,
 * is reported once per area and not checked further: whatever else is wrong with
 * it, the fix is to remove or move it.
 * @param graph Parsed validation surfaces of the package and its file list.
 * @param sources Raw contents of every translated README and Markdown document, keyed by package-relative path.
 * @param stalePaths Package-relative paths of the stale translations, whose headings only warn when they differ.
 * @returns Every problem found, errors and warnings, in path order.
 */
export function validateTranslations(
  graph: DocumentGraph,
  sources: Readonly<Record<string, string>>,
  stalePaths: ReadonlySet<string> = new Set(),
): TranslationIssue[] {
  const issues: TranslationIssue[] = [];
  const reportedAreas = new Set<string>();
  for (const translation of listTranslations(graph.files)) {
    if (!isTranslationLocale(translation.locale)) {
      const area = localeArea(translation);
      if (!reportedAreas.has(area)) {
        reportedAreas.add(area);
        issues.push({
          code: "unsupported-locale",
          message: `${translation.locale} is not a translation locale; the listed locales are ${TRANSLATION_LOCALES.join(", ")}.`,
          severity: "error",
          sourcePath: area,
        });
      }
      continue;
    }
    const untranslatable = untranslatableArea(translation);
    if (untranslatable !== undefined) {
      if (!reportedAreas.has(untranslatable)) {
        reportedAreas.add(untranslatable);
        issues.push({
          code: "untranslatable-area",
          message: `${untranslatable} is never translated: generated reference pages and changelog pages are read in English, and internal docs are never published.`,
          severity: "error",
          sourcePath: untranslatable,
        });
      }
      continue;
    }
    if (!graph.files.has(translation.englishPath)) {
      issues.push({
        code: "missing-english",
        message: `No English counterpart at ${translation.englishPath}; every translation mirrors an English file.`,
        severity: "error",
        sourcePath: translation.packagePath,
        target: translation.englishPath,
      });
    }
    if (!carriesSource(translation)) {
      continue;
    }
    const source = readTranslationSource(translation, sources[translation.packagePath] ?? "");
    if (!isBlobId(source)) {
      issues.push({
        code: "invalid-source",
        message:
          source === undefined
            ? `Missing source: record the git blob ID of ${translation.englishPath}, as \`git hash-object ${translation.englishPath}\` prints it.`
            : `source "${source}" is not a 40-character hexadecimal git blob ID.`,
        severity: "error",
        sourcePath: translation.packagePath,
      });
    }
    addStructureIssues(graph, translation, stalePaths.has(translation.packagePath), issues);
    addEnglishLinkIssues(graph, translation, issues);
  }
  return issues;
}

/** A translation whose recorded `source` can be compared with the English it translates. */
export interface SourcedTranslation {
  /** Package-relative path of the translation. */
  packagePath: string;
  /** Package-relative path of the English counterpart. */
  englishPath: string;
  /** Blob ID the translation records. */
  source: string;
}

/** A translation whose `source` no longer names the English as it stands. */
export interface StaleTranslation extends SourcedTranslation {
  /** Blob ID of the English as it stands. */
  current: string;
}

/**
 * Computes the git blob IDs of package files as `git hash-object` prints them.
 * Injected by tests.
 */
export type BlobHasher = (rootPath: string, paths: readonly string[]) => Promise<Map<string, string>>;

/**
 * Hashes package files with `git hash-object`, which applies the same clean
 * filters as a commit, so a checkout's line endings do not change the result.
 * @param rootPath Absolute package directory, the command's working directory.
 * @param paths Package-relative POSIX paths.
 * @returns Blob IDs keyed by path.
 * @throws When git cannot hash the files.
 */
export const hashBlobs: BlobHasher = async (rootPath, paths) => {
  if (paths.length === 0) {
    return new Map();
  }
  const outcome = await execute(
    { args: ["hash-object", "--", ...paths], command: "git", cwd: rootPath },
    { stdio: "pipe" },
  );
  const ids = (outcome.stdout ?? "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!outcome.isSuccess || ids.length !== paths.length) {
    throw new Error(`git hash-object could not hash the English documents in ${rootPath}.`);
  }
  return new Map(paths.map((path, index) => [path, (ids[index] as string).trim()]));
};

/**
 * Lists the translations that can be checked for drift: those in a listed
 * locale, whose English exists, and whose `source` is a blob ID.
 * @param files Every package-relative file path.
 * @param sources Raw contents keyed by package-relative path.
 * @returns Translations with their recorded source, in path order.
 */
export function listSourcedTranslations(
  files: ReadonlySet<string>,
  sources: Readonly<Record<string, string>>,
): SourcedTranslation[] {
  return listTranslations(files).flatMap((translation) => {
    if (
      !isTranslationLocale(translation.locale) ||
      !carriesSource(translation) ||
      untranslatableArea(translation) !== undefined ||
      !files.has(translation.englishPath)
    ) {
      return [];
    }
    const source = readTranslationSource(translation, sources[translation.packagePath] ?? "");
    return isBlobId(source)
      ? [{ englishPath: translation.englishPath, packagePath: translation.packagePath, source }]
      : [];
  });
}

/**
 * Finds the translations whose English changed since they were made.
 * @param rootPath Absolute package directory.
 * @param translations Translations with a recorded source.
 * @param hash Blob hasher, defaulting to `git hash-object`.
 * @returns Stale translations, in the order given.
 * @throws When the English documents cannot be hashed.
 */
export async function findStaleTranslations(
  rootPath: string,
  translations: readonly SourcedTranslation[],
  hash: BlobHasher = hashBlobs,
): Promise<StaleTranslation[]> {
  const englishPaths = [...new Set(translations.map(({ englishPath }) => englishPath))];
  const current = await hash(rootPath, englishPaths);
  return translations.flatMap((translation) => {
    const id = current.get(translation.englishPath);
    return id === undefined || id.toLowerCase() === translation.source.toLowerCase()
      ? []
      : [{ ...translation, current: id }];
  });
}

/** What a release needs to know about a package's translations. */
export interface TranslationDriftReport {
  /** How many translated READMEs and documents the package has, in any locale. */
  translationCount: number;
  /** Translations whose English changed since they were made. */
  stale: StaleTranslation[];
  /** Translated READMEs and documents whose `source` is missing or malformed, so their drift cannot be judged. */
  unsourced: string[];
}

/**
 * Reads a package from disk and reports which translations are stale.
 * @param rootPath Absolute package directory.
 * @param hash Blob hasher, defaulting to `git hash-object`.
 * @returns Stale and unverifiable translations.
 * @throws When the package cannot be read or its English documents cannot be hashed.
 */
export async function readTranslationDrift(
  rootPath: string,
  hash: BlobHasher = hashBlobs,
): Promise<TranslationDriftReport> {
  const files = new Set(await listPackageFiles(rootPath));
  const translations = listTranslations(files).filter(carriesSource);
  const sources = Object.fromEntries(
    await Promise.all(
      translations.map(async ({ packagePath }) => [packagePath, await readFile(join(rootPath, packagePath), "utf8")]),
    ),
  );
  const sourced = listSourcedTranslations(files, sources);
  const sourcedPaths = new Set(sourced.map(({ packagePath }) => packagePath));
  return {
    stale: await findStaleTranslations(rootPath, sourced, hash),
    translationCount: translations.length,
    unsourced: translations
      .map(({ packagePath }) => packagePath)
      .filter((packagePath) => !sourcedPaths.has(packagePath)),
  };
}

/**
 * Describes how to update a stale translation, starting from what changed.
 * @param stale A stale translation.
 * @returns One line naming the files and the `git diff` that shows the English changes.
 */
export function describeStaleTranslation(stale: StaleTranslation): string {
  return `${stale.packagePath} translates an older ${stale.englishPath}; see what changed with \`git diff ${stale.source} ${stale.current}\`.`;
}
