import type { Plugin, ViteDevServer } from "vite";

import {
  renderAttributionBanner,
  renderAttributionNotice,
  renderSuppressedAttributionWarning,
} from "../catalog/attribution.js";
import type { AttributionMode } from "../catalog/attribution.js";
import { parseIconClass, resolveIconClassName } from "../core/class-names.js";
import { IconRegistry } from "../core/registry.js";
import { renderSvg } from "../core/render.js";
import type { IconFamilyData, ResolvedIcon } from "../core/types.js";
import { generateIconSetCss } from "../generator/css-generator.js";
import { scanFiles, scanIconClasses } from "../scanner/class-scanner.js";

/**
 * Options for configuring the Vite icons plugin.
 */
export interface ViteIconsOptions {
  /**
   * File paths or globs to scan for icon class names.
   */
  content?: string[];

  /**
   * Prefix for icon class names, as in `"ic"` for `.ic-close`. Defaults to `"ic"`.
   */
  prefix?: string;

  /**
   * Icon families to make resolvable, such as the default export of
   * `@codenhub/icons/data/lucide`.
   *
   * No family is bundled by default: a project declares the families it wants,
   * so nothing it did not ask for reaches its output.
   */
  families?: IconFamilyData[];

  /**
   * Family prefix that unqualified icon names resolve against.
   */
  defaultPrefix?: string;

  /**
   * Registry to resolve icons with, replacing the one built from
   * {@link ViteIconsOptions.families}.
   */
  registry?: IconRegistry;

  /**
   * Stroke width applied to icons of stroke-based families that carry no stroke
   * modifier of their own, as in `ic-heart/1.5`.
   */
  strokeWidth?: number | string;

  /**
   * Delivery mode.
   *
   * `"css"` serves generated mask rules through `virtual:icons.css`. `"svg"`
   * replaces `<i class="ic-...">` tags with inline SVG at build time.
   */
  mode?: "css" | "svg";

  /**
   * How license notices for the families used reach the build output.
   *
   * `"auto"` prepends a preserved CSS comment to the generated stylesheet, or,
   * in svg mode, which has no stylesheet, emits `icons-attribution.txt` as an
   * asset. `"file"` emits that asset in both modes, and `"off"` emits nothing
   * and warns when a used family still requires a notice. Defaults to `"auto"`.
   */
  attribution?: AttributionMode;
}

const VIRTUAL_ID = "virtual:icons.css";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;
const ATTRIBUTION_FILE = "icons-attribution.txt";
// The trailing slash matters: without it this would also claim
// `virtual:@codenhub/icons.css`, which is the stylesheet, not an icon.
const ICON_MODULE_PREFIX = "virtual:@codenhub/icons/";
const RESOLVED_ICON_MODULE_PREFIX = "\0" + ICON_MODULE_PREFIX;
const SOURCE_FILE = /\.(html|jsx?|tsx?|vue|svelte|css|scss|sass|less)$/i;
const MARKUP_FILE = /\.(html|jsx?|tsx?|vue|svelte|astro)$/i;
const ASTRO_FILE = /\.astro$/i;
// Markup with `<script>` blocks of JavaScript in it, rather than JavaScript with markup in it.
const TEMPLATE_FILE = /\.(vue|svelte)$/i;
// The key generated stylesheets record their families under, in place of a module id.
const STYLESHEET_KEY = "\0stylesheet";

function resolveIconModule(registry: IconRegistry, request: string): ResolvedIcon {
  // `lucide/heart` names a family and an icon; a single segment goes through
  // the default prefix like any other unqualified name.
  const separatorIndex = request.indexOf("/");
  const name =
    separatorIndex === -1 ? request : `${request.slice(0, separatorIndex)}:${request.slice(separatorIndex + 1)}`;
  const icon = registry.resolve(name);
  if (!icon) {
    throw new Error(`Unknown icon "${request}" imported from ${ICON_MODULE_PREFIX}${request}.`);
  }
  return icon;
}

function renderIconModule(icon: ResolvedIcon, strokeWidth: number | string | undefined, prefix: string): string {
  // The qualified class, as svg mode keeps on an `<svg>` it inlines: the base
  // stylesheet reaches an inlined icon only through `svg[class^="ic-"]` and
  // `svg[class*=" ic-"]`, so without it `--ic-size` and `--ic-color` miss.
  const svg = renderSvg(icon, {
    attributes: { class: `${prefix}-${icon.prefix}-${icon.iconName}` },
    prefix,
    strokeWidth,
  });
  return `export const icon = ${JSON.stringify(icon)};
export const svg = ${JSON.stringify(svg)};
export default svg;
`;
}

function createRegistry(options: ViteIconsOptions): IconRegistry {
  if (options.registry) {
    return options.registry;
  }
  const registry = new IconRegistry({ defaultPrefix: options.defaultPrefix });
  for (const family of options.families ?? []) {
    registry.registerFamily(family);
  }
  return registry;
}

const IDENTIFIER_CHAR = /[\w$]/;
const WHITESPACE = /\s/;

/** Words after which an expression, and so a string or a regular expression, can begin. */
const EXPRESSION_KEYWORDS = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "from",
  "import",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);

/** Punctuation after which an expression can begin. `<` covers a TypeScript type argument such as `Record<'a', T>`. */
const EXPRESSION_PUNCTUATION = "=([{,;:?!&|+-*/%^~<";

/**
 * Whether an expression can begin at `index`, judged from the code before it.
 *
 * A quote or a slash opens a string or a regular expression only there. JSX
 * text is not code, so an apostrophe in "Don't" follows a word and opens
 * nothing, and the `/` of a closing tag such as `</p>` follows a `<`.
 */
function canStartExpression(code: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && WHITESPACE.test(code[i])) {
    i--;
  }
  if (i < 0) {
    return true;
  }
  const char = code[i];
  if (char === ">") {
    // An arrow's body. A lone `>` closes a JSX tag, so what follows it is text.
    return code[i - 1] === "=";
  }
  if (!IDENTIFIER_CHAR.test(char)) {
    return EXPRESSION_PUNCTUATION.includes(char);
  }
  let start = i;
  while (start >= 0 && IDENTIFIER_CHAR.test(code[start])) {
    start--;
  }
  return EXPRESSION_KEYWORDS.has(code.slice(start + 1, i + 1));
}

/**
 * Returns the end of the regular expression literal opening at `index`, or
 * `undefined` when none closes on its line, which a literal must.
 */
function findRegexEnd(code: string, index: number): number | undefined {
  let isInsideCharClass = false;
  for (let j = index + 1; j < code.length; j++) {
    const char = code[j];
    if (char === "\n" || char === "\r") {
      return undefined;
    }
    if (char === "\\") {
      j++;
    } else if (isInsideCharClass) {
      isInsideCharClass = char !== "]";
    } else if (char === "[") {
      isInsideCharClass = true;
    } else if (char === "/") {
      return j;
    }
  }
  return undefined;
}

/**
 * Creates a scanner that reports the quote of the innermost string literal
 * enclosing an offset, or `null`, for offsets asked in increasing order.
 *
 * It reads the code once, however many offsets are asked, so a module with
 * thousands of icons costs one pass rather than one per icon. A template
 * literal's `${…}` is code again, with strings of its own, so the scan keeps a
 * stack: a string inside an expression inside a template is that string, not
 * the template. Comments are skipped, and an offset inside one, or inside a
 * regular expression literal, is in no string.
 */
function createStringScanner(code: string): (offset: number) => string | null {
  // Each frame is a string's quote, or a brace depth for code: the file itself
  // at the bottom, and one per open `${`.
  const frames: (string | number)[] = [0];
  let i = 0;

  function step(): void {
    const char = code[i];
    const nextChar = code[i + 1];
    const top = frames[frames.length - 1];

    if (top === '"' || top === "'") {
      if (char === "\\") {
        // The escaped character, and with a CRLF continuation the line feed after it too.
        i += code.startsWith("\r\n", i + 1) ? 3 : 2;
        return;
      }
      // A quoted string cannot span a line, so one still open at a line break
      // was never a string.
      if (char === top || char === "\n" || char === "\r") {
        frames.pop();
      }
      i++;
      return;
    }
    if (top === "`") {
      if (char === "\\") {
        i += 2;
        return;
      }
      if (char === "`") {
        frames.pop();
      } else if (char === "$" && nextChar === "{") {
        frames.push(0);
        i++;
      }
      i++;
      return;
    }

    if (char === "/" && nextChar === "/") {
      const lineEnd = code.indexOf("\n", i);
      i = lineEnd === -1 ? code.length : lineEnd;
      return;
    }
    if (char === "/" && nextChar === "*") {
      const commentEnd = code.indexOf("*/", i + 2);
      i = commentEnd === -1 ? code.length : commentEnd + 2;
      return;
    }
    if (char === "`" || ((char === '"' || char === "'") && canStartExpression(code, i))) {
      frames.push(char);
    } else if (char === "{") {
      frames[frames.length - 1] = (top as number) + 1;
    } else if (char === "}") {
      if (top === 0 && frames.length > 1) {
        frames.pop();
      } else {
        frames[frames.length - 1] = Math.max(0, (top as number) - 1);
      }
    } else if (char === "/" && canStartExpression(code, i)) {
      const regexEnd = findRegexEnd(code, i);
      if (regexEnd !== undefined) {
        i = regexEnd;
      }
    }
    i++;
  }

  return (offset) => {
    while (i < offset) {
      step();
    }
    if (i > offset) {
      return null;
    }
    const top = frames[frames.length - 1];
    return typeof top === "string" ? top : null;
  };
}

interface ReplaceIconTagsOptions {
  prefix: string;
  strokeWidth?: number | string;
  isJsContext?: boolean;
  /** Whether the source is JSX, where markup outside a string is a JSX element. */
  isJsx?: boolean;
  /** Whether JSX elements are rendered by React, which reads DOM property names and style objects. */
  isReactJsx?: boolean;
  onFamilyUsed: (family: IconFamilyData) => void;
}

const JSX_FILE = /\.[jt]sx$/i;

/**
 * Returns the quote of the string literal an icon tag sits in, or `null`.
 *
 * A quoted string that does not close on the tag's line was JSX text the
 * scanner could not tell from code, as in `<p>Hi, 'friend <i … /></p>`, and the
 * tag is not in a string. Template literals may span lines and are taken as
 * reported.
 */
function stringQuoteAt(code: string, quote: string | null, end: number): string | null {
  if (quote !== '"' && quote !== "'") {
    return quote;
  }
  for (let i = end; i < code.length; i++) {
    const char = code[i];
    if (char === quote) {
      return quote;
    }
    if (char === "\n" || char === "\r") {
      return null;
    }
    if (char === "\\") {
      // The escaped character, and with a CRLF continuation the line feed after it too.
      i += code.startsWith("\r\n", i + 1) ? 2 : 1;
    }
  }
  return null;
}
const STYLE_STRING = /(?<=\s)style="([^"]*)"/g;

/**
 * Rewrites every style string in rendered icon markup as a JSX style object.
 *
 * React rejects a string `style` prop and fails the render, so markup inserted
 * as a JSX element carries a brand color, and each paint a multicolor logo
 * lets `--ic-color` override, as an object instead. Every other host, and
 * markup inside a string, keeps the string.
 */
function toJsxStyle(svg: string): string {
  return svg.replace(STYLE_STRING, (_match, style: string) => {
    const declarations = Object.fromEntries(
      style
        .split(";")
        .map((declaration) => declaration.split(/:(.*)/s).map((part) => part.trim()))
        .filter(([property]) => property)
        // React reads style keys as DOM properties, camel-cased, as in `stopColor`.
        .map(([property, value]) => [
          property.startsWith("--")
            ? property
            : property.replace(/-([a-z])/g, (_dash, letter: string) => letter.toUpperCase()),
          value,
        ]),
    );
    return `style={${JSON.stringify(declarations)}}`;
  });
}

/** A start tag, quoted values included whole, so text between tags is never read as attributes. */
const START_TAG = /<[a-z](?:"[^"]*"|'[^']*'|[^"'>])*>/gi;

/**
 * A quoted value, matched so it is skipped, or a hyphenated or namespaced
 * attribute name other than `aria-*` and `data-*`, which React takes as written.
 */
const SVG_ATTRIBUTE_NAME = /("[^"]*"|'[^']*')|(?<=\s)(?!aria-|data-)[a-z][a-z0-9]*(?:[-:][a-z0-9]+)+(?=\s*=)/gi;

/**
 * Renames the attributes in rendered icon markup to the DOM property names React reads.
 *
 * React warns on `stroke-width` and ignores what it does not know, while the
 * HTML parser knows only `stroke-width`, so the renaming applies only where the
 * markup lands as a JSX element, as in `strokeWidth` and `xlinkHref`.
 */
function toJsxAttributeNames(svg: string): string {
  return svg.replace(START_TAG, (tag: string) =>
    tag.replace(SVG_ATTRIBUTE_NAME, (name: string, quoted?: string) =>
      quoted ? name : name.replace(/[-:]([a-z0-9])/gi, (_separator, letter: string) => letter.toUpperCase()),
    ),
  );
}

/** A braced expression, as in JSX or Svelte, holding braces one level deep, such as `{() => { go(); }}`. */
const BRACED = String.raw`\{(?:[^{}]|\{[^{}]*\})*\}`;

/**
 * An attribute value, matched whole so a `>` inside it, as in `title="a > b"`
 * or `onClick={() => go()}`, does not end the tag: quoted, with escaped quotes
 * inside a string literal, braced, or bare.
 */
const ATTRIBUTE_VALUE = String.raw`"[^"]*"|'[^']*'|\\"[^"\\]*\\"|\\'[^'\\]*\\'|${BRACED}|[^\s"'<>{}\\]+`;

/** An attribute with its leading whitespace: a JSX spread, or a name with an optional value. */
const ATTRIBUTE = String.raw`\s+(?:${BRACED}|[^\s"'<>/={}\\]+(?:\s*=\s*(?:${ATTRIBUTE_VALUE}))?)`;

/**
 * Matches an `<i>` tag carrying a `class` or `className`, quoted plainly or with
 * escaped quotes inside a string literal. Each attribute is matched whole, so
 * the end of `data-class` is not taken for the class, and no two parts of the
 * pattern can match the same text, which keeps a tag that never closes from
 * backtracking for long.
 */
const ICON_TAG = new RegExp(
  String.raw`<i((?:${ATTRIBUTE})*?)\s+(class|className)=(\\?)(["'])([^"'\\]*)\3\4((?:${ATTRIBUTE})*)\s*(?:>\s*<\/i>|\/?>)`,
  "gi",
);

interface IconTagClasses {
  icon: NonNullable<ReturnType<typeof resolveIconClassName>>;
  strokeWidth?: string;
  /** The classes the emitted `<svg>` keeps, the icon class among them. */
  classes: string[];
}

/**
 * Resolves the icon an `<i>` tag's class list names, if any.
 *
 * The icon class stays in the list. The base stylesheet reaches an inlined
 * `<svg>` only through `svg[class^="ic-"]` and `svg[class*=" ic-"]`, so the
 * class is what carries `--ic-size`, `--ic-color`, and inline display onto it;
 * the per-icon rules it could also match set custom properties the `<svg>`
 * rule never reads. The bare prefix class is the one dropped, because `.ic`
 * applies the mask rules, which would paint the `<svg>` box solid.
 */
function resolveIconTagClasses(classValue: string, registry: IconRegistry, prefix: string): IconTagClasses | undefined {
  const prefixDash = `${prefix}-`;
  let resolved: Omit<IconTagClasses, "classes"> | undefined;
  const classes: string[] = [];

  for (const cls of classValue.split(/\s+/).filter(Boolean)) {
    if (cls === prefix) {
      continue;
    }
    if (!resolved && cls.startsWith(prefixDash)) {
      const parsed = parseIconClass(cls.slice(prefixDash.length));
      const icon = resolveIconClassName(registry, parsed.name);
      if (icon) {
        resolved = { icon, strokeWidth: parsed.strokeWidth };
      }
    }
    classes.push(cls);
  }

  return resolved && { ...resolved, classes };
}

/**
 * Removes the `<i>` tags {@link replaceIconTagsWithSvg} would rewrite.
 *
 * What remains is the text in which an icon class is a class svg mode leaves
 * behind, since a rewritten `<svg>` keeps its own.
 */
function removeIconTags(source: string, registry: IconRegistry, prefix: string): string {
  return source.replace(ICON_TAG, (match: string, ...groups: string[]) =>
    resolveIconTagClasses(groups[4] ?? "", registry, prefix) ? "" : match,
  );
}

function replaceIconTagsWithSvg(source: string, registry: IconRegistry, options: ReplaceIconTagsOptions): string {
  const { isJsContext = false, isJsx = false, isReactJsx = false, onFamilyUsed, prefix, strokeWidth } = options;

  const quoteAt = isJsContext ? createStringScanner(source) : undefined;

  return source.replace(
    ICON_TAG,
    (
      match: string,
      before: string,
      attrName: string,
      backslash: string,
      quote: string,
      classValue: string,
      after: string,
      offset: number,
    ) => {
      // Asked of every tag, in order, so the scanner reads the source once.
      const scannedQuote = quoteAt?.(offset) ?? null;
      const resolved = resolveIconTagClasses(classValue, registry, prefix);
      if (!resolved) {
        return match;
      }
      const { icon } = resolved;

      const family = registry.getFamily(icon.prefix);
      if (family) {
        onFamilyUsed(family);
      }

      const effectiveStrokeWidth = resolved.strokeWidth ?? strokeWidth;
      let svg = renderSvg(icon, { prefix, strokeWidth: effectiveStrokeWidth });

      const passthroughAttrs = [before.trim(), after.trim()].filter(Boolean).join(" ");
      const passthroughStr = passthroughAttrs ? ` ${passthroughAttrs}` : "";

      // The bare quote, not the escaped one: in a string literal the escaping
      // below adds the backslash, and adding it here too would double it.
      svg = svg.replace(/^<svg\b/i, `<svg ${attrName}=${quote}${resolved.classes.join(" ")}${quote}`);

      // Outside JavaScript, a tag written with escaped quotes can only sit in a
      // string, such as one in a Svelte `{@html "…"}` expression.
      const enclosingQuote = quoteAt
        ? stringQuoteAt(source, scannedQuote, offset + match.length)
        : backslash
          ? quote
          : null;
      if (enclosingQuote) {
        // A template literal reads "\r\n" as "\n", so "\r" is escaped in every string.
        svg = svg.replace(/\\/g, "\\\\").replace(/\r/g, "\\r");
      }
      if (enclosingQuote === '"' || enclosingQuote === "'") {
        // A line break ends a quoted string. A template keeps it, raw text included, so it stays there.
        svg = svg.replace(/\n/g, "\\n");
      }
      if (enclosingQuote === '"') {
        svg = svg.replace(/"/g, '\\"');
      } else if (enclosingQuote === "'") {
        svg = svg.replace(/'/g, "\\'");
      } else if (enclosingQuote === "`") {
        svg = svg.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
      }

      // `className` with plain quotes outside a string is a JSX element in any
      // file, `.js` included. Only React reads DOM property names and style
      // objects: Solid, Preact, and Vue write JSX attributes into HTML as named.
      const isJsxElement =
        isReactJsx && isJsContext && !enclosingQuote && (isJsx || (attrName === "className" && !backslash));
      if (isJsxElement) {
        // Before the passthrough attributes, which are already written for JSX.
        svg = toJsxAttributeNames(svg);
      }

      // Passthrough attributes are copied from the source, already escaped for
      // the string they sit in, so they join after the escaping.
      if (passthroughStr) {
        svg = svg.replace(/^<svg\b/i, `<svg${passthroughStr}`);
      }

      if (isJsxElement) {
        svg = toJsxStyle(svg);
      }

      return svg;
    },
  );
}

/**
 * Splits an `.astro` file into its frontmatter fence and the template after it.
 *
 * Returns `undefined` for a file that opens with no fence, which is a valid
 * `.astro` file that is template all the way down.
 */
function splitAstroFrontmatter(source: string): { frontmatter: string; template: string } | undefined {
  const openEnd = source.indexOf("\n");
  if (openEnd === -1 || source.slice(0, openEnd).trim() !== "---") {
    return undefined;
  }
  let lineStart = openEnd + 1;
  while (lineStart <= source.length) {
    const lineEnd = source.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? source.length : lineEnd;
    if (source.slice(lineStart, end).trim() === "---") {
      return { frontmatter: source.slice(0, end), template: source.slice(end) };
    }
    if (lineEnd === -1) {
      break;
    }
    lineStart = lineEnd + 1;
  }
  return undefined;
}

/**
 * Replaces icon tags in an `.astro` file, escaping each half for what it is.
 *
 * An `.astro` file is two languages in one: the frontmatter fence is JavaScript,
 * where an icon tag can only appear inside a string literal and the SVG has to
 * be escaped for the quote enclosing it, and the template below is markup, where
 * escaping it would corrupt the output. Rewriting the whole file under either
 * rule breaks the other half, and skipping the frontmatter is worse than it
 * sounds: svg mode emits no stylesheet, so a tag left behind there is not an
 * icon delivered another way, it is a blank element.
 *
 * A `<script>` in the template is JavaScript too and is treated as such. An icon
 * tag written inside a string in a template expression is not: `{cond && <i
 * class="ic-x" />}` holds markup rather than a string, so telling the two apart
 * needs a parser rather than a split, and treating either as the other breaks it.
 */
function replaceIconTagsInTemplate(source: string, registry: IconRegistry, options: ReplaceIconTagsOptions): string {
  // A `<script>` body is JavaScript sitting in the middle of markup, so it takes
  // the frontmatter's rule rather than the template's. Only the body does: the
  // opening tag's own attributes carry quotes that would derail the scan for the
  // string enclosing a match.
  const scriptRegion = /(<script\b[^>]*>)([\s\S]*?)(<\/script\b[^>]*>)/gi;
  const markup = (text: string): string => replaceIconTagsWithSvg(text, registry, { ...options, isJsContext: false });

  let result = "";
  let lastIndex = 0;
  for (const match of source.matchAll(scriptRegion)) {
    const [region, openTag, body, closeTag] = match;
    result += markup(source.slice(lastIndex, match.index));
    result += openTag + replaceIconTagsWithSvg(body, registry, { ...options, isJsContext: true }) + closeTag;
    lastIndex = match.index + region.length;
  }
  return result + markup(source.slice(lastIndex));
}

function replaceIconTagsInAstro(source: string, registry: IconRegistry, options: ReplaceIconTagsOptions): string {
  const parts = splitAstroFrontmatter(source);
  if (parts === undefined) {
    return replaceIconTagsInTemplate(source, registry, options);
  }
  const frontmatter = replaceIconTagsWithSvg(parts.frontmatter, registry, { ...options, isJsContext: true });
  return `${frontmatter}${replaceIconTagsInTemplate(parts.template, registry, options)}`;
}

/**
 * Vite plugin that turns icon utility classes into CSS mask rules, or into
 * inline SVG when `mode` is `"svg"`.
 *
 * In CSS mode it serves the generated stylesheet, base rules included, as
 * `virtual:icons.css` in dev and links it from every HTML entry point. A build
 * with HTML entries emits it as a hashed CSS asset and links that instead; a
 * build without HTML entries, such as a library build, emits no stylesheet.
 * Svg mode emits none either. It leaves
 * `@import "@codenhub/icons";` alone in both modes: that import is the base
 * stylesheet and means the same thing whether or not this plugin is in the
 * pipeline. The license notices for the families the build used travel as a
 * banner on the generated stylesheet, wherever that stylesheet goes, or as
 * `icons-attribution.txt` in svg mode and under `attribution: "file"`.
 *
 * @param options - Families, scanning, class prefix, delivery mode, and attribution.
 * @returns The Vite plugin.
 */
export function viteIcons(options: ViteIconsOptions = {}): Plugin {
  const prefix = options.prefix ?? "ic";
  const registry = createRegistry(options);
  const contentPaths = options.content ?? [];
  const mode = options.mode ?? "css";
  const attributionMode = options.attribution ?? "auto";

  const scannedFiles = new Set<string>();
  const inMemoryClasses = new Set<string>();
  const resolvedVirtualIds = new Set<string>();
  // Kept per module and replaced whenever the module is transformed again, so
  // a watch rebuild forgets what an edit removed.
  const familiesByModule = new Map<string, Map<string, IconFamilyData>>();
  const unreplacedByModule = new Map<string, Set<string>>();
  // Whether JSX is React's, which reads DOM property names and style objects.
  let isReactJsx = false;
  let devServer: ViteDevServer | undefined;
  // Reference to the stylesheet asset of the build in progress.
  let stylesheetRef: string | undefined;
  // Vite's own default; overwritten by `configResolved` before any hook that
  // reads it can run. Used to make the dev stylesheet's injected `<script>`
  // `src` respect a non-root `base` -- Vite does not rewrite a plugin's
  // injected tag attributes for `base` itself, so an un-prefixed root-absolute
  // `src` would resolve to the wrong origin path when this app is mounted
  // under a subpath (e.g. behind a reverse proxy that only forwards that
  // subpath), silently reaching a *different* dev server's plugin instance
  // instead of erroring.
  let base = "/";

  /**
   * Marks the generated stylesheet stale and asks the browser for it again.
   *
   * Dev discovers icon classes as it transforms modules, which happens after
   * the HTML has been served. Without this, a class first seen during a
   * transform would sit in memory with nothing to put it on the page until
   * someone reloaded by hand.
   */
  function invalidateStylesheet(): void {
    if (!devServer) {
      return;
    }
    for (const targetId of new Set<string>([RESOLVED_VIRTUAL_ID, ...resolvedVirtualIds])) {
      const mod = devServer.moduleGraph.getModuleById(targetId);
      if (!mod) {
        continue;
      }
      devServer.moduleGraph.invalidateModule(mod);
      devServer.ws.send({
        type: "update",
        updates: [{ acceptedPath: mod.url, path: mod.url, timestamp: Date.now(), type: "js-update" }],
      });
    }
  }

  function rememberFamilies(moduleId: string, families: Iterable<IconFamilyData>): void {
    familiesByModule.set(moduleId, new Map([...families].map((family) => [family.prefix, family])));
  }

  function collectUsedFamilies(): IconFamilyData[] {
    const families = new Map<string, IconFamilyData>();
    for (const moduleFamilies of familiesByModule.values()) {
      for (const [familyPrefix, family] of moduleFamilies) {
        families.set(familyPrefix, family);
      }
    }
    return [...families.values()];
  }

  /** Rewrites a module's icon tags as inline SVG, and records what it used and what it left behind. */
  function inlineIcons(
    moduleId: string,
    rewrite: (onFamilyUsed: (family: IconFamilyData) => void) => string,
    source: string,
  ): string {
    const families: IconFamilyData[] = [];
    const replaced = rewrite((family) => families.push(family));
    rememberFamilies(moduleId, families);
    collectUnreplacedClasses(removeIconTags(source, registry, prefix), moduleId);
    return replaced;
  }

  /**
   * Records icon classes that survived inline SVG replacement.
   *
   * `svg` mode rewrites `<i class="ic-...">` tags and nothing else, so a class
   * left on a button or a form control renders nothing at all: there is no
   * stylesheet in this mode to carry its mask. Silence is the worst outcome, so
   * every such class is reported once.
   */
  function collectUnreplacedClasses(source: string, file: string): void {
    const classes = new Set<string>();
    for (const className of scanIconClasses(source, { prefix })) {
      const parsed = parseIconClass(className.slice(prefix.length + 1));
      if (resolveIconClassName(registry, parsed.name)) {
        classes.add(className);
      }
    }
    unreplacedByModule.set(file, classes);
  }

  function renderUnreplacedWarning(): string | undefined {
    // Each class once, under the first module found with it.
    const unreplaced = new Map<string, string>();
    for (const [file, classes] of unreplacedByModule) {
      for (const className of classes) {
        if (!unreplaced.has(className)) {
          unreplaced.set(className, file);
        }
      }
    }
    if (unreplaced.size === 0) {
      return undefined;
    }
    const listed = [...unreplaced].map(([className, file]) => `- ${className} in ${file}`);
    return [
      `Icon classes were found on elements that mode "svg" does not rewrite, so they render nothing:`,
      ...listed,
      `Inline SVG replacement covers <i class="${prefix}-..."> tags only. Use that form, or switch to mode "css", which serves mask rules that work on any element.`,
    ].join("\n");
  }

  function generateCssFromContent(): string {
    const foundClasses = new Set<string>(inMemoryClasses);
    scanFiles(contentPaths, { prefix }, foundClasses);
    scanFiles(scannedFiles, { prefix }, foundClasses);

    // Sorted so the same classes always give the same bytes: a build names the
    // emitted stylesheet after its content hash.
    const { css, families } = generateIconSetCss([...foundClasses].toSorted(), registry, {
      injectBase: true,
      prefix,
      strokeWidth: options.strokeWidth,
    });
    rememberFamilies(STYLESHEET_KEY, families);

    if (attributionMode !== "auto") {
      return css;
    }
    const banner = renderAttributionBanner(families);
    return banner === undefined ? css : `${banner}\n${css}`;
  }

  return {
    name: "codenhub-icons",
    enforce: "pre",

    resolveId(id: string) {
      const rawId = id.replace(/^\//, "").replace(/^@id\//, "");
      if (rawId.startsWith(ICON_MODULE_PREFIX)) {
        return "\0" + rawId;
      }
      // `@codenhub/icons/style.css` is deliberately absent: the package's own
      // base stylesheet resolves through its exports so the bare import means
      // the same thing with or without this plugin.
      if (
        rawId === "virtual:icons.css" ||
        rawId === "virtual:codenhub-icons.css" ||
        rawId === "virtual:@codenhub/icons.css" ||
        id.endsWith("virtual:icons.css")
      ) {
        const resolvedId = "\0" + rawId;
        resolvedVirtualIds.add(resolvedId);
        return resolvedId;
      }
      return null;
    },

    load(id: string) {
      if (id.startsWith(RESOLVED_ICON_MODULE_PREFIX)) {
        const icon = resolveIconModule(registry, id.slice(RESOLVED_ICON_MODULE_PREFIX.length));
        const family = registry.getFamily(icon.prefix);
        rememberFamilies(id, family ? [family] : []);
        return renderIconModule(icon, options.strokeWidth, prefix);
      }
      // Matched by the exact same fixed ids `resolveId` claims above, not by
      // the `\0virtual:` convention alone: that prefix is a generic Vite/Rollup
      // marker for "resolved virtual module" that other plugins use too (Astro's
      // own internal pages module among them), so matching it on its own hijacked
      // modules this plugin never resolved.
      if (
        resolvedVirtualIds.has(id) ||
        id === RESOLVED_VIRTUAL_ID ||
        id === "\0virtual:codenhub-icons.css" ||
        id === "\0virtual:@codenhub/icons.css" ||
        id.endsWith("virtual:icons.css")
      ) {
        return mode === "svg" ? "" : generateCssFromContent();
      }
      return null;
    },

    transformIndexHtml(html, ctx) {
      if (mode === "svg") {
        return inlineIcons(
          ctx.filename ?? "index.html",
          (onFamilyUsed) =>
            replaceIconTagsWithSvg(html, registry, {
              isJsContext: false,
              onFamilyUsed,
              prefix,
              strokeWidth: options.strokeWidth,
            }),
          html,
        );
      }

      const scanned = scanIconClasses(html, { prefix });
      for (const cls of scanned) {
        inMemoryClasses.add(cls);
      }
      if (ctx.filename) {
        scannedFiles.add(ctx.filename);
      }

      // In dev the stylesheet is referenced rather than inlined, so it is a
      // module the server can invalidate. An inlined <style> is a snapshot
      // taken before Vite has transformed a single module, and nothing can
      // refresh it: a class written in a file this plugin has not seen yet
      // would stay missing until the page was reloaded by hand. A build can
      // snapshot it, because there the modules are transformed before the HTML is.
      if (ctx.server) {
        return [
          {
            tag: "script",
            // `base` already ends in "/" (Vite's own guarantee), so this
            // does not need its own separator.
            attrs: { type: "module", src: `${base}@id/${VIRTUAL_ID}` },
            injectTo: "head",
          },
        ];
      }

      // A build links the asset `generateBundle` emitted rather than inlining a
      // <style>, which a CSP without 'unsafe-inline', a nonce or a hash refuses.
      // Vite swaps the placeholder for the asset's URL under `base`.
      if (stylesheetRef) {
        return [
          { tag: "link", attrs: { href: `__VITE_ASSET__${stylesheetRef}__`, rel: "stylesheet" }, injectTo: "head" },
        ];
      }
      // Called outside a Vite build, there is no asset to link.
      return [{ tag: "style", attrs: { id: "codenhub-icons" }, children: generateCssFromContent(), injectTo: "head" }];
    },

    // `order: "pre"` puts this handler ahead of every other plugin's ordinary
    // `transform`, not just of the plugins listed after this one. Astro's
    // compiler is an ordinary `transform` on an `enforce: "pre"` plugin that
    // Astro lists before the user's own, so `enforce` alone ran it first, and
    // this hook received compiled JavaScript in which a frontmatter string had
    // been re-quoted (codenhub/codenhub#451).
    transform: {
      order: "pre",
      handler(code, id) {
        if (mode === "svg") {
          if (id && !id.includes("node_modules") && !id.startsWith("\0") && MARKUP_FILE.test(id)) {
            // `.astro` arrives here as its own source rather than as compiled
            // output, because this handler is `order: "pre"` and so runs ahead of
            // Astro's compiler. It is the only markup file that is part JavaScript
            // and part template, so it is the only one that cannot take a single
            // escaping rule. Astro never calls `transformIndexHtml` for its pages,
            // which is why this hook is the whole of svg mode's reach into them.
            // `.vue` and `.svelte` are markup with script blocks, which the
            // template rule splits the same way, minus the frontmatter.
            const replaced = inlineIcons(
              id,
              (onFamilyUsed) => {
                const replaceOptions = { isReactJsx, onFamilyUsed, prefix, strokeWidth: options.strokeWidth };
                if (ASTRO_FILE.test(id)) {
                  return replaceIconTagsInAstro(code, registry, replaceOptions);
                }
                if (TEMPLATE_FILE.test(id)) {
                  return replaceIconTagsInTemplate(code, registry, replaceOptions);
                }
                return replaceIconTagsWithSvg(code, registry, {
                  ...replaceOptions,
                  isJsContext: true,
                  isJsx: JSX_FILE.test(id),
                });
              },
              code,
            );
            if (replaced !== code) {
              return { code: replaced, map: null };
            }
          }
          return null;
        }

        const knownClasses = inMemoryClasses.size;
        const knownFiles = scannedFiles.size;

        for (const cls of scanIconClasses(code, { prefix })) {
          inMemoryClasses.add(cls);
        }

        if (id && !id.includes("node_modules") && !id.startsWith("\0") && SOURCE_FILE.test(id)) {
          scannedFiles.add(id);
        }

        if (inMemoryClasses.size !== knownClasses || scannedFiles.size !== knownFiles) {
          invalidateStylesheet();
        }

        return null;
      },
    },

    generateBundle(_outputOptions, bundle) {
      // Emitted here rather than from `transformIndexHtml`, which Vite 5 and 6
      // call without a plugin context. Vite runs that hook after this one, and
      // every HTML entry is a chunk by then, so a library build gets no file.
      stylesheetRef = undefined;
      const hasHtmlEntry = Object.values(bundle).some(
        (file) => file.type === "chunk" && file.facadeModuleId?.endsWith(".html"),
      );
      if (mode === "css" && hasHtmlEntry) {
        stylesheetRef = this.emitFile({ name: "codenhub-icons.css", source: generateCssFromContent(), type: "asset" });
      }

      const unreplaced = renderUnreplacedWarning();
      if (unreplaced) {
        this.warn(unreplaced);
      }

      const families = collectUsedFamilies();
      if (attributionMode === "off") {
        const warning = renderSuppressedAttributionWarning(families);
        if (warning) {
          this.warn(warning);
        }
        return;
      }
      // Inline SVG output has no stylesheet to carry a banner, so the notice
      // becomes an asset in both explicit "file" mode and svg mode.
      if (attributionMode !== "file" && mode !== "svg") {
        return;
      }
      const notice = renderAttributionNotice(families);
      if (notice) {
        this.emitFile({ fileName: ATTRIBUTION_FILE, source: `${notice}\n`, type: "asset" });
      }
    },

    configResolved(config) {
      base = config.base;
      // `@vitejs/plugin-react` and `@vitejs/plugin-react-swc` name every plugin they add this way.
      isReactJsx = config.plugins.some((plugin) => plugin.name.startsWith("vite:react"));
    },

    watchChange(id, change) {
      if (change.event === "delete") {
        familiesByModule.delete(id);
        unreplacedByModule.delete(id);
      }
    },

    configureServer(server) {
      devServer = server;

      // The `transform` hook already invalidates when it scans a new class out
      // of a module the bundler loaded. This watcher covers the rest: a file
      // that is listed in `content` or scanned once but never enters the module
      // graph -- a standalone HTML fragment, a template -- whose edit Vite would
      // otherwise not connect to the stylesheet.
      const handleFileChange = (filePath: string) => {
        if (filePath.includes("node_modules") || !SOURCE_FILE.test(filePath)) {
          return;
        }

        scannedFiles.add(filePath);
        invalidateStylesheet();
      };

      server.watcher.on("change", handleFileChange);
      server.watcher.on("add", handleFileChange);
    },
  };
}

/**
 * Named alias for {@link viteIcons}.
 */
export const viteIconsPlugin = viteIcons;

export default viteIcons;
