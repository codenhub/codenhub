import type { Plugin } from "vite";

import { ICON_MARKER_PREFIX, PLUGIN_NAME, TRANSFORM_EXTENSIONS } from "./constants";
import type { IconDefinition } from "./data";
import { icons } from "./data";
import { replaceIconTags } from "./parser";

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
   * Markup is inserted verbatim without sanitization and must be trusted.
   */
  icons?: Record<string, IconDefinition>;
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

/**
 * Vite plugin that replaces `<i class="ic-<name>">` marker elements with
 * inline SVG at build time, in both HTML and JS/TS/JSX/TSX files.
 *
 * A built-in set of icons is included. Pass `options.icons` to extend the
 * registry or override built-in icons. Consumer entries win on name conflicts.
 *
 * Plugin order is `"pre"` so icon replacement runs before framework transforms.
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
 */
export function iconsPlugin(options?: IconsPluginOptions): Plugin {
  const iconMarkupMap = createIconMarkupMap(options?.icons, options?.shouldClear);
  return {
    name: PLUGIN_NAME,
    enforce: "pre",

    transformIndexHtml: {
      order: "pre",
      handler(html: string) {
        // Shield HTML comments, <pre>, and <noscript> tags from icon marker replacements.
        // NOTE: We intentionally do NOT shield <script> or <style> tags here. This ensures that
        // consumers can still replace icons dynamically within JavaScript/TypeScript blocks
        // and CSS/style declarations (e.g., using mask-image).
        const literalBlocks: string[] = [];
        const cleanedHtml = html.replace(
          /(<!--[\s\S]*?-->|<pre\b[^>]*>[\s\S]*?<\/pre>|<noscript\b[^>]*>[\s\S]*?<\/noscript>)/gi,
          (match) => {
            literalBlocks.push(match);
            return `<!--__LITERAL_PLACEHOLDER_${literalBlocks.length - 1}__-->`;
          },
        );

        const replaced = replaceIconTags({ iconMarkupMap, source: cleanedHtml, isJsContext: false });

        return replaced.replace(/<!--__LITERAL_PLACEHOLDER_(\d+)__-->/g, (_, indexStr) => {
          const index = parseInt(indexStr, 10);
          return literalBlocks[index];
        });
      },
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

export type { IconDefinition, IconOptions } from "./data";
