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
        const noscriptBlocks: string[] = [];
        // Temporarily extract existing noscript blocks to avoid replacing links inside them
        const htmlWithoutNoscript = html.replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi, (match) => {
          noscriptBlocks.push(match);
          return `<!--__NOSCRIPT_PLACEHOLDER_${noscriptBlocks.length - 1}__-->`;
        });

        let noscript = "";
        const transformed = htmlWithoutNoscript.replace(STYLESHEET_RE, (linkTag: string) => {
          noscript += `    ${linkTag.replace(LINK_TAG_END_RE, ">")}\n`;

          const cleanTag = linkTag.replace(ONLOAD_ATTR_RE, "");

          return cleanTag
            .replace(STYLESHEET_REL_ATTR_RE, 'rel="preload"')
            .replace(LINK_TAG_END_RE, ' as="style" onload="this.onload=null;this.rel=\'stylesheet\'">');
        });

        const restoreNoscripts = (content: string) => {
          return content.replace(/<!--__NOSCRIPT_PLACEHOLDER_(\d+)__-->/g, (_, indexStr) => {
            const index = parseInt(indexStr, 10);
            return noscriptBlocks[index];
          });
        };

        if (!noscript) {
          return restoreNoscripts(transformed);
        }

        const hasHead = /<\/head>/i.test(transformed);
        const withFallback = hasHead
          ? transformed.replace(/(<\/head>)/i, `  <noscript>\n${noscript}  </noscript>\n  $1`)
          : transformed;

        return restoreNoscripts(withFallback);
      },
    },
  };
}
