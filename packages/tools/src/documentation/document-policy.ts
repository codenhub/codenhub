interface HeadingDefinition {
  depth: number;
  text?: string;
}

/** Closed presentation frontmatter schema for public package documents. */
export interface PublicDocumentFrontmatter {
  /** Optional page summary. */
  description?: string;
  /** Page label used for navigation and browser titles. */
  title: string;
}

const ALLOWED_FRONTMATTER_FIELDS = new Set(["description", "title"]);

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

/**
 * Validates public document frontmatter against its closed schema.
 * @param frontmatter Parsed frontmatter fields.
 * @param sourcePath Document path used in error messages.
 * @returns The validated title and optional description.
 * @throws When a field is unknown, missing, or empty.
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

  return {
    description: readOptionalDescription(frontmatter, sourcePath),
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

/**
 * Orders public document paths so `index.md` always comes first.
 * @param left First path relative to the package `docs/` directory.
 * @param right Second path relative to the package `docs/` directory.
 * @returns Negative, zero, or positive following `Array.prototype.sort` semantics.
 */
export function comparePublicDocumentPaths(left: string, right: string): number {
  if (left === "index.md") {
    return right === "index.md" ? 0 : -1;
  }
  if (right === "index.md") {
    return 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
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
 * no YAML dependency is needed. A nested or unreadable field is reported as an
 * unknown value rather than being silently dropped, which keeps schema
 * validation strict.
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
