interface HeadingDefinition {
  depth: number;
  text?: string;
}

/** Closed presentation frontmatter schema for public package documents. */
export interface PublicDocumentFrontmatter {
  /**
   * Whether a folder's `index.md` is a functional entrypoint rather than an
   * ordinary page: only the sibling documents it links to, in that link
   * order, are published. Absent on every other page.
   */
  curated?: boolean;
  /** Optional page summary. */
  description?: string;
  /**
   * Optional section label for a folder's `index.md`, decoupled from its
   * `title`. Absent on every other page.
   */
  group?: string;
  /**
   * Optional sidebar position among siblings. Absent on the package `index.md`,
   * which is always first.
   */
  order?: number;
  /** Page label used for navigation and browser titles. */
  title: string;
}

const ALLOWED_FRONTMATTER_FIELDS = new Set(["curated", "description", "group", "order", "title"]);

const FOLDER_INDEX = /^[^/]+\/index\.md$/;

/**
 * Reduces a document source path to its path relative to the package `docs/`
 * directory, so the same rules apply whether the caller passes `docs/x.md` or an
 * absolute or bundler-relative path.
 * @param sourcePath Any path ending in the document's `docs/`-relative location.
 * @returns The `docs/`-relative path, or the input when it has no `docs/` segment.
 */
function docsRelativePath(sourcePath: string): string {
  const marker = sourcePath.lastIndexOf("docs/");
  return marker === -1 ? sourcePath : sourcePath.slice(marker + "docs/".length);
}

/**
 * Coerces a frontmatter `order` value to a non-negative integer.
 *
 * The Markdown frontmatter parser yields strings, while a bundler's own parser
 * yields numbers, so both are accepted. Anything else, including a fractional or
 * negative number, resolves to `undefined`.
 * @param value Raw `order` frontmatter value.
 * @returns The position, or `undefined` when the value cannot be one.
 */
export function coercePublicDocumentOrder(value: unknown): number | undefined {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : undefined;
}

function readRequiredTitle(frontmatter: Record<string, unknown>, sourcePath: string): string {
  const value = frontmatter.title;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid title frontmatter in ${sourcePath}: expected a non-empty string.`);
  }
  return value;
}

function readOptionalDescription(frontmatter: Record<string, unknown>, sourcePath: string): string | undefined {
  const value = frontmatter.description;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid description frontmatter in ${sourcePath}: expected a non-empty string.`);
  }
  return value;
}

function readOptionalOrder(frontmatter: Record<string, unknown>, sourcePath: string): number | undefined {
  const value = frontmatter.order;
  if (value === undefined) {
    return undefined;
  }
  const order = coercePublicDocumentOrder(value);
  if (order === undefined) {
    throw new Error(`Invalid order frontmatter in ${sourcePath}: expected a non-negative integer.`);
  }
  return order;
}

function readOptionalGroup(frontmatter: Record<string, unknown>, sourcePath: string): string | undefined {
  const value = frontmatter.group;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid group frontmatter in ${sourcePath}: expected a non-empty string.`);
  }
  return value;
}

/**
 * Coerces a frontmatter `curated` value to a boolean.
 *
 * The Markdown frontmatter parser yields strings, while a bundler's own parser
 * yields booleans, so both are accepted. Anything else resolves to `undefined`.
 * @param value Raw `curated` frontmatter value.
 * @returns The flag, or `undefined` when the value cannot be one.
 */
export function coercePublicDocumentCurated(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") {
      return normalized === "true";
    }
  }
  return undefined;
}

function readOptionalCurated(frontmatter: Record<string, unknown>, sourcePath: string): boolean | undefined {
  const value = frontmatter.curated;
  if (value === undefined) {
    return undefined;
  }
  const curated = coercePublicDocumentCurated(value);
  if (curated === undefined) {
    throw new Error(`Invalid curated frontmatter in ${sourcePath}: expected a boolean.`);
  }
  return curated;
}

/**
 * Validates public document frontmatter against its closed schema.
 * @param frontmatter Parsed frontmatter fields.
 * @param sourcePath Document path used in error messages and to place the document.
 * @returns The validated title, optional description, section label, order, and curated flag.
 * @throws When a field is unknown, missing, empty, or not allowed on this path.
 */
export function parsePublicDocumentFrontmatter(
  frontmatter: Record<string, unknown>,
  sourcePath: string,
): PublicDocumentFrontmatter {
  for (const field of Object.keys(frontmatter)) {
    if (!ALLOWED_FRONTMATTER_FIELDS.has(field)) {
      throw new Error(`Unknown frontmatter field "${field}" in ${sourcePath}.`);
    }
  }

  const relativePath = docsRelativePath(sourcePath);
  const order = readOptionalOrder(frontmatter, sourcePath);
  if (order !== undefined && relativePath === "index.md") {
    throw new Error(`Invalid order frontmatter in ${sourcePath}: the package index is always first.`);
  }
  const group = readOptionalGroup(frontmatter, sourcePath);
  if (group !== undefined && !FOLDER_INDEX.test(relativePath)) {
    throw new Error(`Invalid group frontmatter in ${sourcePath}: only a folder index page can set a section label.`);
  }
  const curated = readOptionalCurated(frontmatter, sourcePath);
  if (curated !== undefined && !FOLDER_INDEX.test(relativePath)) {
    throw new Error(`Invalid curated frontmatter in ${sourcePath}: only a folder index page can be curated.`);
  }

  return {
    curated,
    description: readOptionalDescription(frontmatter, sourcePath),
    group,
    order,
    title: readRequiredTitle(frontmatter, sourcePath),
  };
}

/**
 * Asserts that a public document contains exactly one H1.
 * @param headings Headings parsed from the document.
 * @param sourcePath Document path used in error messages.
 * @throws When the document has no H1 or more than one.
 */
export function assertSingleH1(headings: readonly HeadingDefinition[], sourcePath: string): void {
  const h1Count = headings.filter(({ depth }) => depth === 1).length;
  if (h1Count !== 1) {
    throw new Error(`Invalid headings in ${sourcePath}: expected exactly one H1, found ${h1Count}.`);
  }
}

/** A public document reduced to what places it among its siblings. */
export interface OrderablePublicDocument {
  /** Path relative to the package `docs/` directory. */
  relativePath: string;
  /** Explicit sidebar position from frontmatter, when the document sets one. */
  order?: number;
}

// Documents without an explicit `order` sort after every document that has one,
// keeping their path order among themselves.
const UNORDERED_POSITION = Number.MAX_SAFE_INTEGER;

/**
 * Orders public documents: `index.md` first, then by frontmatter `order`, then
 * by path. A document with no `order` sorts after every ordered sibling.
 * @param left First document.
 * @param right Second document.
 * @returns Negative, zero, or positive following `Array.prototype.sort` semantics.
 */
export function comparePublicDocuments(left: OrderablePublicDocument, right: OrderablePublicDocument): number {
  if (left.relativePath === "index.md") {
    return right.relativePath === "index.md" ? 0 : -1;
  }
  if (right.relativePath === "index.md") {
    return 1;
  }
  const byOrder = (left.order ?? UNORDERED_POSITION) - (right.order ?? UNORDERED_POSITION);
  if (byOrder !== 0) {
    return byOrder;
  }
  return left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0;
}

/**
 * Orders public document paths so `index.md` always comes first, ignoring any
 * frontmatter `order`. Use {@link comparePublicDocuments} where order matters.
 * @param left First path relative to the package `docs/` directory.
 * @param right Second path relative to the package `docs/` directory.
 * @returns Negative, zero, or positive following `Array.prototype.sort` semantics.
 */
export function comparePublicDocumentPaths(left: string, right: string): number {
  return comparePublicDocuments({ relativePath: left }, { relativePath: right });
}

const FRONTMATTER_PATTERN = /^---\r?\n(?<body>[\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)/;
const SCALAR_LINE = /^(?<key>[A-Za-z][\w-]*):[^\S\r\n]*(?<value>.*)$/;

/** A Markdown document split into its frontmatter fields and body. */
export interface ParsedMarkdown {
  /** Frontmatter fields, empty when the document has none. */
  frontmatter: Record<string, unknown>;
  /** Markdown body without the frontmatter block. */
  body: string;
}

function unquote(value: string): string {
  const isQuoted =
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  return isQuoted ? value.slice(1, -1) : value;
}

/**
 * Splits a Markdown document into frontmatter fields and its authored body.
 *
 * Only the flat scalar fields allowed by the public document schema are read, so
 * no YAML dependency is needed. A field whose value is not a scalar still records
 * its key, so schema validation rejects it as unknown or empty; the lines making
 * up such a value are skipped rather than guessed at.
 * @param source Raw Markdown file contents.
 * @returns Frontmatter fields and the body that follows them.
 */
export function parseMarkdown(source: string): ParsedMarkdown {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (match?.groups === undefined) {
    return { body: source, frontmatter: {} };
  }

  const frontmatter: Record<string, unknown> = {};
  for (const line of (match.groups.body as string).split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    const field = SCALAR_LINE.exec(line);
    if (field?.groups === undefined) {
      continue;
    }
    const value = (field.groups.value as string).trim();
    frontmatter[field.groups.key as string] = value === "" ? null : unquote(value);
  }

  return { body: source.slice(match[0].length), frontmatter };
}
