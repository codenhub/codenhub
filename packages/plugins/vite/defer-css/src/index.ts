import type { Plugin } from "vite";

const STYLESHEET_RE =
  /<link\b(?=[^>]*\brel\s*=\s*(?:"[^"]*\bstylesheet\b[^"]*"|'[^']*\bstylesheet\b[^']*'|stylesheet(?=[\s>])))(?=[^>]*\bhref\s*=)[^>]*\/?\s*>/gi;
const STYLESHEET_REL_ATTR_RE =
  /\brel\s*=\s*(?:"[^"]*\bstylesheet\b[^"]*"|'[^']*\bstylesheet\b[^']*'|stylesheet(?=[\s>]))/i;
const ONLOAD_ATTR_RE = /\bonload\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
const LINK_TAG_END_RE = /\/?\s*>$/;

/** Options accepted by {@link deferCssPlugin}. */
export interface DeferCssPluginOptions {
  /**
   * Content Security Policy nonce to inject into preload load helper script.
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
 * - Returns unmodified HTML if the input has no `</head>` tag or no stylesheets to defer.
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
          /(<!--[\s\S]*?-->|<pre\b[^>]*>[\s\S]*?<\/pre>|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<noscript\b[^>]*>[\s\S]*?<\/noscript>)/gi,
          (match) => {
            literalBlocks.push(match);
            return `<!--__LITERAL_PLACEHOLDER_${literalBlocks.length - 1}__-->`;
          },
        );

        let noscript = "";
        const transformed = cleanedHtml.replace(STYLESHEET_RE, (linkTag: string) => {
          noscript += `    ${linkTag.replace(LINK_TAG_END_RE, ">")}\n`;

          const cleanTag = linkTag.replace(ONLOAD_ATTR_RE, "");

          return cleanTag
            .replace(STYLESHEET_REL_ATTR_RE, 'rel="preload"')
            .replace(
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
      const swap = function() { l.rel = 'stylesheet'; };
      let isLoaded = false;
      try { isLoaded = window.performance && window.performance.getEntriesByName(l.href).length > 0; } catch (e) {}
      if (l.sheet || isLoaded) swap();
      else { l.addEventListener('load', swap); l.addEventListener('error', swap); }
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
