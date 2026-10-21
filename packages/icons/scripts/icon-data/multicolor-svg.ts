import { optimize } from "svgo";

// Every logo's viewBox is at least 254 units across at the pinned commit, so two
// decimals is under 1/25,000 of the box, far below a pixel at any icon size.
const FLOAT_PRECISION = 2;

// Markup a full-color icon cannot carry through the mask and inline paths: a
// stylesheet or class reaches every element on the page once inlined, text
// depends on the reader's fonts, and an external reference is not
// self-contained.
const UNSUPPORTED_MARKUP: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /<style\b/i, reason: "a `<style>` element" },
  { pattern: /\sclass="/i, reason: "class attributes" },
  { pattern: /<script\b/i, reason: "a `<script>` element" },
  { pattern: /<foreignObject\b/i, reason: "a `<foreignObject>` element" },
  { pattern: /<text\b/i, reason: "a `<text>` element" },
  { pattern: /<image\b/i, reason: "an `<image>` element" },
  { pattern: /href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i, reason: "an external reference" },
];

const ID_ATTRIBUTE = /(?<=\s)id="([^"]+)"/g;
const URL_REFERENCE = /url\((['"]?)#([^)'"]+)\1\)/g;
const HREF_REFERENCE = /(?<=\s)(?:xlink:)?href="#([^"]+)"/g;

/**
 * Names the markup in an upstream file that keeps it out of a multicolor family.
 *
 * @returns Why the file is left out, or `undefined` when it can be kept.
 */
export function findUnsupportedMarkup(source: string): string | undefined {
  return UNSUPPORTED_MARKUP.find(({ pattern }) => pattern.test(source))?.reason;
}

/**
 * Rewrites upstream artwork into equivalent, smaller markup.
 *
 * Upstream logos are exported from design tools with six or seven decimals per
 * coordinate and absolute path commands, which made some single logos weigh
 * 200–365 KB in a consumer's CSS. Ids are kept for {@link namespaceIds}, and
 * colors are kept as written so the inline `--ic-color` fallback reads the
 * artwork's own values.
 *
 * @param source - Contents of an upstream `.svg` file.
 * @param origin - Path used in error messages when the file cannot be parsed.
 * @returns The optimized file, still a complete `<svg>` document.
 * @throws When SVGO cannot parse the file.
 */
export function optimizeArtwork(source: string, origin: string): string {
  try {
    return optimize(source, {
      floatPrecision: FLOAT_PRECISION,
      multipass: true,
      plugins: [
        { name: "preset-default", params: { overrides: { cleanupIds: false, convertColors: false } } },
        // A Content Security Policy that blocks style attributes would drop a
        // gradient stop's `style="stop-color: …"` and leave the logo uncolored.
        "convertStyleToAttrs",
      ],
    }).data;
  } catch (error) {
    throw new Error(`Cannot optimize ${origin}.`, { cause: error });
  }
}

/**
 * Prefixes every id in an icon body, and every reference to one, with a namespace.
 *
 * Upstream files reuse ids across logos, and ids are global to the page an
 * icon is inlined into, so two logos sharing one would draw with each other's
 * gradients. `xlink:href` is written as `href`, which every current browser
 * reads and JSX accepts.
 *
 * @param body - Inner SVG markup of one icon.
 * @param namespace - Prefix unique to the icon, such as `logos-google`.
 * @returns The body with its ids namespaced.
 */
export function namespaceIds(body: string, namespace: string): string {
  const ids = new Set([...body.matchAll(ID_ATTRIBUTE)].map(([, id]) => id));
  const rename = (id: string): string => (ids.has(id) ? `${namespace}-${id}` : id);
  return body
    .replace(ID_ATTRIBUTE, (_match, id: string) => `id="${rename(id)}"`)
    .replace(URL_REFERENCE, (_match, quote: string, id: string) => `url(${quote}#${rename(id)}${quote})`)
    .replace(HREF_REFERENCE, (_match, id: string) => `href="#${rename(id)}"`);
}
