/** An icon reduced to the markup and geometry the registry stores. */
export interface NormalizedIcon {
  /** Inner SVG markup, carrying its own presentation attributes. */
  body: string;
  /** viewBox width. */
  width: number;
  /** viewBox height. */
  height: number;
}

const XML_COMMENT = /<!--[\s\S]*?-->/g;
const SVG_ELEMENT = /<svg\b(?<attributes>[^>]*)>(?<body>[\s\S]*)<\/svg>/i;
const ATTRIBUTE = /(?<name>[a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"(?<value>[^"]*)"/g;
const WHITESPACE_BETWEEN_TAGS = />\s+</g;
const WHITESPACE_RUN = /\s+/g;

// Attributes that describe the document rather than how the artwork is drawn.
// Everything else is presentation the body has to keep once the wrapper is gone.
const DISCARDED_ATTRIBUTES = new Set([
  "class",
  "focusable",
  "height",
  "id",
  "role",
  "version",
  "viewbox",
  "width",
  "xmlns",
  "xmlns:xlink",
]);

function isDiscarded(name: string): boolean {
  const lower = name.toLowerCase();
  return DISCARDED_ATTRIBUTES.has(lower) || lower.startsWith("aria-") || lower.startsWith("data-");
}

function readAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    const { name, value } = match.groups ?? {};
    if (name && value !== undefined) {
      attributes.set(name, value);
    }
  }
  return attributes;
}

function readViewBox(attributes: Map<string, string>): { width: number; height: number } | undefined {
  const viewBox = attributes.get("viewBox") ?? attributes.get("viewbox");
  if (viewBox) {
    const parts = viewBox.trim().split(WHITESPACE_RUN).map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
      return { height: parts[3], width: parts[2] };
    }
  }

  const width = Number(attributes.get("width"));
  const height = Number(attributes.get("height"));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { height, width } : undefined;
}

function collapse(markup: string): string {
  return markup.replace(WHITESPACE_BETWEEN_TAGS, "><").replace(WHITESPACE_RUN, " ").trim();
}

/**
 * Reduces an upstream SVG file to an icon body and its viewBox.
 *
 * The `<svg>` wrapper is removed so the registry can rebuild it at any size,
 * and the presentation attributes it carried are moved onto a wrapping `<g>` so
 * the body stays self-contained and keeps rendering as its author drew it.
 *
 * @param source - Contents of an upstream `.svg` file.
 * @param origin - Path used in error messages when the file cannot be read.
 * @returns The icon body and geometry.
 * @throws When the file holds no `<svg>` element, no usable viewBox, or an empty body.
 */
export function normalizeSvg(source: string, origin: string): NormalizedIcon {
  const match = SVG_ELEMENT.exec(source.replace(XML_COMMENT, ""));
  if (!match?.groups) {
    throw new Error(`No <svg> element in ${origin}.`);
  }

  const attributes = readAttributes(match.groups.attributes);
  const viewBox = readViewBox(attributes);
  if (!viewBox) {
    throw new Error(`No usable viewBox in ${origin}.`);
  }

  const body = collapse(match.groups.body);
  if (body === "") {
    throw new Error(`Empty icon body in ${origin}.`);
  }

  const presentation = [...attributes].filter(([name]) => !isDiscarded(name));
  if (presentation.length === 0) {
    return { body, height: viewBox.height, width: viewBox.width };
  }

  const groupAttributes = presentation.map(([name, value]) => `${name}="${value}"`).join(" ");
  return { body: `<g ${groupAttributes}>${body}</g>`, height: viewBox.height, width: viewBox.width };
}
