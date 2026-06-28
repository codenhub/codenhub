import type { Plugin } from "vite";

import { ICON_MARKER_PREFIX, ICON_TAG_REGEX, PLUGIN_NAME, TRANSFORM_EXTENSIONS } from "./constants";
import type { IconDefinition } from "./data";
import { icons } from "./data";

/** Options accepted by {@link iconsPlugin}. */
export interface IconsPluginOptions {
  /**
   * If true, clears the built-in icon registry.
   * Only custom icons supplied in the `icons` option will be registered.
   */
  shouldClear?: boolean;
  /**
   * Additional icons merged on top of the built-in registry.
   * When a name exists in both, the consumer entry takes precedence.
   * Each value is either a raw SVG string or an {@link IconDefinition} object
   * that also declares optional lookup aliases via `alternativeNames`.
   */
  icons?: Record<string, IconDefinition>;
}

interface ResolvedIcon {
  iconClass: string;
  markup: string;
}

function getIconMarkup(iconDefinition: IconDefinition): string {
  return typeof iconDefinition === "string" ? iconDefinition : iconDefinition.markup;
}

function getAlternativeNames(iconDefinition: IconDefinition): readonly string[] {
  return typeof iconDefinition === "string" ? [] : (iconDefinition.alternativeNames ?? []);
}

function createIconMarkupMap(
  extraIcons: Record<string, IconDefinition> = {},
  shouldClear = false,
): Map<string, string> {
  const iconMarkupMap = new Map<string, string>();

  if (!shouldClear) {
    for (const [iconName, iconDefinition] of Object.entries(icons)) {
      const markup = getIconMarkup(iconDefinition);
      iconMarkupMap.set(iconName, markup);
      for (const name of getAlternativeNames(iconDefinition)) {
        iconMarkupMap.set(name, markup);
      }
    }
  }

  for (const [iconName, iconDefinition] of Object.entries(extraIcons)) {
    const markup = getIconMarkup(iconDefinition);
    iconMarkupMap.set(iconName, markup);
    for (const name of getAlternativeNames(iconDefinition)) {
      iconMarkupMap.set(name, markup);
    }
  }

  return iconMarkupMap;
}

function splitClasses(classValue: string): string[] {
  return classValue.split(/\s+/).filter(Boolean);
}

function resolveIcon(iconMarkupMap: Map<string, string>, classValue: string): ResolvedIcon | null {
  const classes = splitClasses(classValue);

  for (const className of classes) {
    if (!className.startsWith(ICON_MARKER_PREFIX)) {
      continue;
    }

    const iconNameCandidate = className.slice(ICON_MARKER_PREFIX.length);
    const markup = iconMarkupMap.get(iconNameCandidate);
    if (!markup) {
      continue;
    }

    return { iconClass: className, markup };
  }

  return null;
}

function stripIconClass(classValue: string, iconClass: string): string | null {
  const remaining = splitClasses(classValue)
    .filter((className) => className !== iconClass)
    .join(" ");
  return remaining || null;
}

function joinPassthroughAttributes(attrsBeforeClass: string, attrsAfterClass: string): string {
  const segments = [attrsBeforeClass.trim(), attrsAfterClass.trim()].filter(Boolean);
  return segments.length > 0 ? ` ${segments.join(" ")}` : "";
}

function createIconTagRegex(): RegExp {
  return new RegExp(ICON_TAG_REGEX.source, ICON_TAG_REGEX.flags);
}

interface SvgReplacementOptions {
  iconMarkupMap: Map<string, string>;
  match: string;
  attrsBeforeClass: string;
  attrName: string;
  quote: string;
  classValue: string;
  attrsAfterClass: string;
  isJsContext: boolean;
  source: string;
  offset: number;
}

function isRegexStart(code: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(code[i])) {
    i--;
  }
  if (i < 0) {
    return true;
  }
  const char = code[i];
  if (!/[a-zA-Z0-9_$]/.test(char)) {
    return char !== ")" && char !== "]" && char !== "}";
  }
  let start = i;
  while (start >= 0 && /[a-zA-Z0-9_$]/.test(code[start])) {
    start--;
  }
  const word = code.slice(start + 1, i + 1);
  const keywords = ["return", "throw", "yield", "case", "typeof", "delete", "void", "in", "instanceof"];
  return keywords.includes(word);
}

function getEnclosingQuote(code: string, matchIndex: number): string | null {
  let isInsideDouble = false;
  let isInsideSingle = false;
  let isInsideBacktick = false;
  let isInsideLineComment = false;
  let isInsideBlockComment = false;
  let isEscaped = false;

  for (let i = 0; i < matchIndex; i++) {
    const char = code[i];
    const nextChar = code[i + 1];

    if (isInsideLineComment) {
      if (char === "\n" || char === "\r") {
        isInsideLineComment = false;
      }
      continue;
    }
    if (isInsideBlockComment) {
      if (char === "*" && nextChar === "/") {
        isInsideBlockComment = false;
        i++; // skip /
      }
      continue;
    }

    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (!isInsideDouble && !isInsideSingle && !isInsideBacktick) {
      if (char === "/" && nextChar === "/") {
        isInsideLineComment = true;
        i++;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        isInsideBlockComment = true;
        i++;
        continue;
      }
      if (char === "/" && nextChar !== "/" && nextChar !== "*" && isRegexStart(code, i)) {
        // Scan to end of regex literal
        let j = i + 1;
        let isInsideCharClass = false;
        while (j < matchIndex) {
          const c = code[j];
          if (c === "\\") {
            j += 2;
            continue;
          }
          if (isInsideCharClass) {
            if (c === "]") {
              isInsideCharClass = false;
            }
          } else {
            if (c === "[") {
              isInsideCharClass = true;
            } else if (c === "/") {
              i = j; // advance outer loop index
              break;
            }
          }
          j++;
        }
        continue;
      }
    }

    if (char === '"' && !isInsideSingle && !isInsideBacktick) {
      isInsideDouble = !isInsideDouble;
    } else if (char === "'" && !isInsideDouble && !isInsideBacktick) {
      isInsideSingle = !isInsideSingle;
    } else if (char === "`" && !isInsideDouble && !isInsideSingle) {
      isInsideBacktick = !isInsideBacktick;
    }
  }

  if (isInsideDouble) {
    return '"';
  }
  if (isInsideSingle) {
    return "'";
  }
  if (isInsideBacktick) {
    return "`";
  }
  return null;
}

function buildSvgReplacement(options: SvgReplacementOptions): string {
  const {
    iconMarkupMap,
    match,
    attrsBeforeClass,
    attrName,
    quote,
    classValue,
    attrsAfterClass,
    isJsContext,
    source,
    offset,
  } = options;

  const icon = resolveIcon(iconMarkupMap, classValue);
  if (!icon) {
    return match;
  }

  const extraClasses = stripIconClass(classValue, icon.iconClass);
  const classAttr = extraClasses ? ` ${attrName}=${quote}${extraClasses}${quote}` : "";
  const passthroughAttrStr = joinPassthroughAttributes(attrsBeforeClass, attrsAfterClass);

  let markup = icon.markup;
  if (isJsContext) {
    const enclosingQuote = getEnclosingQuote(source, offset);
    if (enclosingQuote === '"') {
      markup = markup.replace(/"/g, '\\"');
    }
  }

  return markup.replace(/^<svg\b/i, `<svg${classAttr}${passthroughAttrStr}`);
}

interface ReplaceIconTagsOptions {
  iconMarkupMap: Map<string, string>;
  source: string;
  isJsContext?: boolean;
}

function replaceIconTags(options: ReplaceIconTagsOptions): string {
  const { iconMarkupMap, source, isJsContext = false } = options;
  const iconTagRegex = createIconTagRegex();

  return source.replace(
    iconTagRegex,
    (
      match,
      before: string,
      attrName: string,
      backslash: string,
      quote: string,
      classValue: string,
      after: string,
      offset: number,
    ) =>
      buildSvgReplacement({
        iconMarkupMap,
        match,
        attrsBeforeClass: before,
        attrName,
        quote: backslash + quote,
        classValue,
        attrsAfterClass: after,
        isJsContext,
        source,
        offset,
      }),
  );
}

/**
 * Vite plugin that replaces `<i class="ic-<name>">` marker elements with
 * inline SVG at build time, in both HTML and JS/TS/JSX/TSX files.
 *
 * A built-in set of icons is included. Pass `options.icons` to extend the
 * registry or override built-in icons. Consumer entries win on name conflicts.
 *
 * Plugin order is `"pre"` so icon replacement runs before framework transforms.
 *
 *
 * @param options Configuration options for the icons plugin.
 * @returns A Vite {@link Plugin} instance.
 *
 * @remarks
 * **Side Effects:**
 * - Scans and replaces `<i class="ic-<name>">` (or `className`) tags in HTML and JS/TS/JSX/TSX files with inlined SVG elements at build time.
 *
 * **Failure/Fallback Behavior:**
 * - Ignores unknown icon names and leaves the original marker elements unchanged.
 * - Returns `null` from the transform hook if the code does not contain the icon prefix `ic-` or if no modifications were made.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { iconsPlugin } from "@codenhub/vite-plugin-icons";
 *
 * export default { plugins: [iconsPlugin()] };
 * ```
 *
 * @example
 * ```ts
 * // With custom icons
 * import { iconsPlugin } from "@codenhub/vite-plugin-icons";
 *
 * export default {
 *   plugins: [
 *     iconsPlugin({
 *       icons: { star: "<svg>...</svg>" },
 *     }),
 *   ],
 * };
 * ```
 */
export default function iconsPlugin(options?: IconsPluginOptions): Plugin {
  const iconMarkupMap = createIconMarkupMap(options?.icons, options?.shouldClear);
  return {
    name: PLUGIN_NAME,
    enforce: "pre",

    transformIndexHtml: {
      order: "pre",
      handler: (html: string) => replaceIconTags({ iconMarkupMap, source: html, isJsContext: false }),
    },

    transform(code: string, id: string) {
      const fileId = id.split("?", 1)[0];
      if (!TRANSFORM_EXTENSIONS.test(fileId)) {
        return null;
      }
      if (!code.includes(ICON_MARKER_PREFIX)) {
        return null;
      }

      const transformed = replaceIconTags({
        iconMarkupMap,
        source: code,
        isJsContext: true,
      });
      if (transformed === code) {
        return null;
      }

      return { code: transformed, map: null };
    },
  };
}
