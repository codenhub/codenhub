import type { Plugin } from "vite";

const STYLESHEET_RE =
  /<link\b(?=[^>]*\brel\s*=\s*(?:"[^"]*\bstylesheet\b[^"]*"|'[^']*\bstylesheet\b[^']*'|stylesheet(?=[\s>])))(?=[^>]*\bhref\s*=)[^>]*\/?\s*>/gi;
const STYLESHEET_REL_ATTR_RE =
  /\brel\s*=\s*(?:"[^"]*\bstylesheet\b[^"]*"|'[^']*\bstylesheet\b[^']*'|stylesheet(?=[\s>]))/i;
const ONLOAD_ATTR_RE = /\bonload\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
const LINK_TAG_END_RE = /\/?\s*>$/;

/**
 * Vite plugin that converts `<link rel="stylesheet">` tags in HTML entry
 * points to non-render-blocking preloads, then swaps them back to stylesheets
 * once loaded. A `<noscript>` fallback is inserted for browsers with
 * JavaScript disabled.
 *
 * Runs with `enforce: "post"` so it acts on the final HTML output after all
 * other transforms. Does not affect CSS imported through JavaScript modules.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { deferCssPlugin } from "@codenhub/vite-plugin-defer-css";
 *
 * export default { plugins: [deferCssPlugin()] };
 * ```
 */
export function deferCssPlugin(): Plugin {
  return {
    name: "vite-plugin-defer-css",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html: string) {
        let noscript = "";
        const transformed = html.replace(STYLESHEET_RE, (linkTag: string) => {
          noscript += `    ${linkTag.replace(LINK_TAG_END_RE, ">")}\n`;

          const cleanTag = linkTag.replace(ONLOAD_ATTR_RE, "");

          return cleanTag
            .replace(STYLESHEET_REL_ATTR_RE, 'rel="preload"')
            .replace(LINK_TAG_END_RE, ' as="style" onload="this.onload=null;this.rel=\'stylesheet\'">');
        });

        if (!noscript) {
          return transformed;
        }

        return transformed.replace(/(<\/head>)/i, `  <noscript>\n${noscript}  </noscript>\n  $1`);
      },
    },
  };
}
