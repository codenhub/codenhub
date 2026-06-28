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
  const baseIcons = shouldClear ? {} : icons;
  const mergedIcons: Record<string, IconDefinition> = { ...baseIcons, ...extraIcons };

  for (const [iconName, iconDefinition] of Object.entries(mergedIcons)) {
    const markup = getIconMarkup(iconDefinition);
    const names = [iconName, ...getAlternativeNames(iconDefinition)];

    for (const name of names) {
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

function getEnclosingQuote(code: string, matchIndex: number): string | null {
  let index = matchIndex - 1;
  while (index >= 0 && code[index] !== "\n" && code[index] !== "\r") {
    const char = code[index];
    if (char === '"' || char === "'" || char === "`") {
      let escaped = false;
      let check = index - 1;
      while (check >= 0 && code[check] === "\\") {
        escaped = !escaped;
        check--;
      }
      if (!escaped) {
        return char;
      }
    }
    index--;
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
    (match, before: string, attrName: string, quote: string, classValue: string, after: string, offset: number) =>
      buildSvgReplacement({
        iconMarkupMap,
        match,
        attrsBeforeClass: before,
        attrName,
        quote,
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
 *
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
