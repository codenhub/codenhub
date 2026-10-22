import type { Plugin } from "vite";

const LINK_RE = /<link\b[^>]*>/gi;
const ATTRIBUTE_RE = /(\s+)([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
const STYLESHEET_TOKEN_RE = /(?:^|\s)stylesheet(?:\s|$)/i;
const LINK_TAG_END_RE = /\/?\s*>$/;

/**
 * Whether a `<link>` tag is a stylesheet with an `href`. Attributes are read by
 * exact name, so `data-rel` or `data-href` never count, and only the first
 * `rel` counts, as in HTML.
 */
function isStylesheetLink(linkTag: string): boolean {
  let rel: string | undefined;
  let hasHref = false;
  for (const [, , name, value] of linkTag.matchAll(ATTRIBUTE_RE)) {
    const attributeName = name.toLowerCase();
    if (attributeName === "rel" && rel === undefined) {
      rel = (value ?? "").replace(/^(["'])([\s\S]*)\1$/, "$2");
    } else if (attributeName === "href" && value !== undefined) {
      hasHref = true;
    }
  }
  return hasHref && rel !== undefined && STYLESHEET_TOKEN_RE.test(rel);
}

/** Options accepted by {@link deferCssPlugin}. */
export interface DeferCssPluginOptions {
  /**
   * Content Security Policy nonce to inject into preload load helper script.
   * The trusted build-time value is interpolated without escaping.
   */
  nonce?: string;
}

/**
 * Vite plugin that converts `<link rel="stylesheet">` tags in HTML entry
 * points to non-render-blocking preloads, then swaps them back to stylesheets
 * once loaded. A `<noscript>` fallback is inserted for browsers with
 * JavaScript disabled.
 *
 * Runs with `enforce: "post"` so it acts on the final HTML output after all
 * other transforms. Does not affect CSS imported through JavaScript modules.
 *
 * @param options Configuration options for the defer CSS plugin.
 * @returns A Vite {@link Plugin} instance.
 *
 * @remarks
 * **Side Effects:**
 * - Converts matches of `<link rel="stylesheet">` tags to `<link rel="preload" as="style">`.
 * - Appends a `<noscript>` block just before `</head>` containing the original `<link rel="stylesheet">` elements.
 * - When `options.nonce` is provided, appends an inline `<script nonce="...">` block to wire up transition event handlers dynamically to avoid CSP violations.
 *
 * **Failure/Fallback Behavior:**
 * - Returns unmodified HTML when there are no matching stylesheet links.
 * - Without `</head>`, matching links are still converted but fallback markup
 *   and the optional helper script cannot be injected.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { deferCssPlugin } from "@codenhub/vite-plugin-defer-css";
 *
 * export default { plugins: [deferCssPlugin()] };
 * ```
 */
export function deferCssPlugin(options?: DeferCssPluginOptions): Plugin {
  return {
    name: "vite-plugin-defer-css",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html: string) {
        const literalBlocks: string[] = [];
        const cleanedHtml = html.replace(
          // An end tag ends at the first ">" after whitespace or "/", as HTML parses `</script foo>`.
          /(<!--[\s\S]*?-->|<pre\b[^>]*>[\s\S]*?<\/pre(?:[\s/][^>]*)?>|<script\b[^>]*>[\s\S]*?<\/script(?:[\s/][^>]*)?>|<style\b[^>]*>[\s\S]*?<\/style(?:[\s/][^>]*)?>|<noscript\b[^>]*>[\s\S]*?<\/noscript(?:[\s/][^>]*)?>)/gi,
          (match) => {
            literalBlocks.push(match);
            return `<!--__LITERAL_PLACEHOLDER_${literalBlocks.length - 1}__-->`;
          },
        );

        let noscript = "";
        const transformed = cleanedHtml.replace(LINK_RE, (linkTag: string) => {
          if (!isStylesheetLink(linkTag)) {
            return linkTag;
          }
          noscript += `    ${linkTag.replace(LINK_TAG_END_RE, ">")}\n`;

          let isFirstRel = true;
          const cleanTag = linkTag.replace(ATTRIBUTE_RE, (attribute: string, whitespace: string, name: string) => {
            const attributeName = name.toLowerCase();
            if (attributeName === "onload") {
              return whitespace;
            }
            if (attributeName === "rel" && isFirstRel) {
              isFirstRel = false;
              return `${whitespace}rel="preload"`;
            }
            return attribute;
          });

          return cleanTag.replace(
            LINK_TAG_END_RE,
            options?.nonce
              ? ' as="style" data-defer-css>'
              : ' as="style" onload="this.onload=null;this.rel=\'stylesheet\'">',
          );
        });

        const restoreLiterals = (content: string) => {
          return content.replace(/<!--__LITERAL_PLACEHOLDER_(\d+)__-->/g, (_, indexStr) => {
            const index = parseInt(indexStr, 10);
            return literalBlocks[index];
          });
        };

        if (!noscript) {
          return restoreLiterals(transformed);
        }

        const hasHead = /<\/head>/i.test(transformed);
        let withFallback = transformed;
        if (hasHead) {
          let injected = `  <noscript>\n${noscript}  </noscript>\n`;
          if (options?.nonce) {
            injected += `  <script nonce="${options.nonce}">
    document.querySelectorAll('link[data-defer-css]').forEach(function(l) {
      const swap = function() {
        l.rel = 'stylesheet';
        l.removeEventListener('load', swap);
        l.removeEventListener('error', swap);
      };
      let isLoaded = false;
      try { isLoaded = window.performance && window.performance.getEntriesByName(l.href).length > 0; } catch (e) {}
      if (l.sheet || isLoaded) swap();
      else {
        l.addEventListener('load', swap);
        l.addEventListener('error', swap);
      }
    });
  </script>\n`;
          }
          withFallback = transformed.replace(/(<\/head>)/i, `${injected}  $1`);
        }

        return restoreLiterals(withFallback);
      },
    },
  };
}
