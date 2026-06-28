import type { Plugin } from "vite";

const LOADER_STYLES = `
  #page-loader {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.3s ease;
  }

  #page-loader.hidden {
    opacity: 0;
    pointer-events: none;
  }

  #page-loader .spinner {
    width: 2.5rem;
    height: 2.5rem;
  }
`;

const LOADER_BODY = `
  <div id="page-loader" role="status" aria-label="Loading">
    <svg class="spinner" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><style>.spinner_V8m1{transform-origin:center;animation:spinner_zKoa 2s linear infinite}.spinner_V8m1 circle{stroke-linecap:round;animation:spinner_YpZS 1.5s ease-in-out infinite}@keyframes spinner_zKoa{100%{transform:rotate(360deg)}}@keyframes spinner_YpZS{0%{stroke-dasharray:0 150;stroke-dashoffset:0}47.5%{stroke-dasharray:42 150;stroke-dashoffset:-16}95%,100%{stroke-dasharray:42 150;stroke-dashoffset:-59}}</style><g class="spinner_V8m1"><circle cx="12" cy="12" r="9.5" fill="none" stroke-width="3"></circle></g></svg>
  </div>
  <noscript>
    <style>
      #page-loader { display: none !important; }
    </style>
  </noscript>
  <script>
    window.addEventListener("load", function () {
      const loader = document.getElementById("page-loader");
      if (!loader) return;
      loader.classList.add("hidden");
      const fallback = setTimeout(function () { loader.remove(); }, 500);
      loader.addEventListener("transitionend", function () {
        clearTimeout(fallback);
        loader.remove();
      });
    });
  </script>
`;

/** Options accepted by {@link addLoaderPlugin}. */
export interface AddLoaderPluginOptions {
  /**
   * Background color for the page-loader overlay.
   * Defaults to `var(--color-background, #fafafa)`.
   */
  backgroundColor?: string;
  /**
   * Spinner color.
   * Defaults to `currentColor` falling back to `var(--color-primary, #0a0a0a)`.
   */
  color?: string;
  /**
   * Content Security Policy nonce to inject into style and script tags.
   */
  nonce?: string;
}

/**
 * Vite plugin that injects a full-screen page-loader overlay into every HTML
 * entry point. The loader fades out and removes itself after the `load` event
 * fires. A `<noscript>` rule hides the loader when JavaScript is unavailable.
 *
 * Runs with `enforce: "post"` so injection happens on the final HTML output.
 *
 * The injected element uses `id="page-loader"` and reads the following CSS
 * custom properties for theming, falling back to neutral values when unset:
 * - `--color-background` (default `#fafafa`)
 * - `--color-border` (default `#d4d4d4`)
 * - `--color-primary` (default `#0a0a0a`)
 *
 * @param options Configuration options for the add loader plugin.
 * @returns A Vite {@link Plugin} instance.
 *
 * @remarks
 * **Side Effects:**
 * - Injects a CSS `<style>` tag into the HTML `<head>`.
 * - Injects a full-screen page loader HTML block (`#page-loader`) and inline `<script>` at the start of `<body>` to handle fading out and removing the loader.
 * - When `options.nonce` is provided, attaches the nonce to the injected `<style>` and `<script>` elements.
 *
 * **Failure/Fallback Behavior:**
 * - Returns unmodified HTML if the input lacks `</head>` or `<body>` tags.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { addLoaderPlugin } from "@codenhub/vite-plugin-add-loader";
 *
 * export default { plugins: [addLoaderPlugin()] };
 * ```
 */
export function addLoaderPlugin(options?: AddLoaderPluginOptions): Plugin {
  const bgValue = options?.backgroundColor ?? "var(--color-background, #fafafa)";
  const colorValue = options?.color ?? "var(--color-primary, #0a0a0a)";
  const nonceAttr = options?.nonce ? ` nonce="${options.nonce}"` : "";

  const styledCss = `
    ${LOADER_STYLES}
    #page-loader { background: ${bgValue}; }
    #page-loader .spinner { color: ${colorValue}; }
  `;

  return {
    name: "vite-plugin-add-loader",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html: string) {
        if (!/<\/head>/i.test(html) || !/<body\b/i.test(html)) {
          return html;
        }
        const withStyle = html.replace(/(<\/head>)/i, `<style${nonceAttr}>${styledCss}</style>\n$1`);
        let loaderBodyWithNonce = LOADER_BODY;
        if (nonceAttr) {
          loaderBodyWithNonce = loaderBodyWithNonce
            .replace(/<script>/g, `<script${nonceAttr}>`)
            .replace(/<style>/g, `<style${nonceAttr}>`);
        }
        return withStyle.replace(/(<body([^>]*)>)/i, `$1${loaderBodyWithNonce}`);
      },
    },
  };
}
