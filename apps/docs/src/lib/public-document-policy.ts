interface HeadingDefinition {
  depth: number;
  text?: string;
}

export interface PublicDocumentFrontmatter {
  description?: string;
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

export function assertSingleH1(headings: readonly HeadingDefinition[], sourcePath: string): void {
  const h1Count = headings.filter(({ depth }) => depth === 1).length;
  if (h1Count !== 1) {
    throw new Error(`Invalid headings in ${sourcePath}: expected exactly one H1, found ${h1Count}.`);
  }
}

export function comparePublicDocumentPaths(left: string, right: string): number {
  if (left === "index.md") {
    return right === "index.md" ? 0 : -1;
  }
  if (right === "index.md") {
    return 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}
