import type { Plugin } from "vite";

import type { IconDefinition } from "./data";
import { icons } from "./data";
import { ICON_MARKER_PREFIX, ICON_TAG_REGEX, PLUGIN_NAME, TRANSFORM_EXTENSIONS } from "./constants";

/** Options accepted by {@link iconsPlugin}. */
export interface IconsPluginOptions {
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

function createIconMarkupMap(extraIcons: Record<string, IconDefinition> = {}): Map<string, string> {
  const iconMarkupMap = new Map<string, string>();
  const mergedIcons: Record<string, IconDefinition> = { ...icons, ...extraIcons };

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

function buildSvgReplacement(
  iconMarkupMap: Map<string, string>,
  match: string,
  attrsBeforeClass: string,
  classValue: string,
  attrsAfterClass: string,
): string {
  const icon = resolveIcon(iconMarkupMap, classValue);
  if (!icon) {
    return match;
  }

  const extraClasses = stripIconClass(classValue, icon.iconClass);
  const classAttr = extraClasses ? ` class="${extraClasses}"` : "";
  const passthroughAttrStr = joinPassthroughAttributes(attrsBeforeClass, attrsAfterClass);

  return icon.markup.replace(/^<svg\b/i, `<svg${classAttr}${passthroughAttrStr}`);
}

function replaceIconTags(iconMarkupMap: Map<string, string>, source: string): string {
  const iconTagRegex = createIconTagRegex();

  return source.replace(iconTagRegex, (match, before: string, _quote: string, classValue: string, after: string) =>
    buildSvgReplacement(iconMarkupMap, match, before, classValue, after),
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
 * import { iconsPlugin } from "@codenhub/vite-plugins";
 *
 * export default { plugins: [iconsPlugin()] };
 * ```
 *
 * @example
 * ```ts
 * // With custom icons
 * import { iconsPlugin } from "@codenhub/vite-plugins";
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
  const iconMarkupMap = createIconMarkupMap(options?.icons);
  return {
    name: PLUGIN_NAME,
    enforce: "pre",

    transformIndexHtml: {
      order: "pre",
      handler: (html: string) => replaceIconTags(iconMarkupMap, html),
    },

    transform(code: string, id: string) {
      const fileId = id.split("?", 1)[0];
      if (!TRANSFORM_EXTENSIONS.test(fileId)) {
        return null;
      }
      if (!code.includes(ICON_MARKER_PREFIX)) {
        return null;
      }

      const transformed = replaceIconTags(iconMarkupMap, code);
      if (transformed === code) {
        return null;
      }

      return { code: transformed, map: null };
    },
  };
}
