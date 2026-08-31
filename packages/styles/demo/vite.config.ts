import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import lucide from "@codenhub/icons/data/lucide";
import { viteIcons } from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/* The demo is the playground worn as a deployable reference: the same fixture
   pages and the same `shared/matrix.js` spec, rendered against the built
   `dist/` CSS a consumer installs, under a branded shell. Pointing `root` at
   the playground keeps a single copy of every fixture -- the demo owns only
   its chrome, and nothing under `playground/` changes. */
const playgroundRoot = resolve(__dirname, "../playground");
const pages = globSync("**/*.html", { cwd: playgroundRoot }).map((file) => resolve(playgroundRoot, file));

const posix = (path: string): string => path.replace(/\\/g, "/");
const chromeEntry = resolve(__dirname, "chrome.ts");
const sharedEntryCss = resolve(playgroundRoot, "shared/entry-vanilla.css");
const nativeEntryCss = resolve(playgroundRoot, "native/entry-vanilla.css");
const entryCssPaths = new Set([posix(sharedEntryCss), posix(nativeEntryCss)]);

/* `dev` and `debug` serve `shared/playground.js` and `shared/matrix.js` over
   HTTP from the playground root. A production build only bundles `type=module`
   scripts and copies `publicDir`, so these classic scripts would be dropped;
   `playground.js` also cannot become a module, because it `document.write`s its
   stylesheet link. Inlining both verbatim keeps them in every built page with
   no fork to drift. */
const inlineScript = (source: string): string => source.replace(/<\/script/gi, "<\\/script");
const playgroundJs = inlineScript(readFileSync(resolve(playgroundRoot, "shared/playground.js"), "utf8"));
const matrixJs = inlineScript(readFileSync(resolve(playgroundRoot, "shared/matrix.js"), "utf8"));

const CHROME_IDS = {
  native: "virtual:styles-demo-chrome-native",
  standard: "virtual:styles-demo-chrome",
} as const;
const resolvedChromeId = (id: string): string => `\0${id}`;

/**
 * Layers the deployable shell over the reused playground pages.
 *
 * - Pins the built-CSS entry (`env=vanilla`); the vanilla/build switch is a
 *   development affordance a deployed reference does not need.
 * - Inlines `playground.js` and `matrix.js` so the built pages keep the theme,
 *   aesthetic, and variant-grid wiring `dev` and `debug` load over HTTP.
 * - Loads the compiled `entry-vanilla.css` through Vite -- so it is a real
 *   stylesheet link that also resolves once mounted under `/<slug>/` -- and
 *   suppresses the root-absolute `document.write` of it that `playground.js`
 *   performs.
 * - Injects `chrome.ts`, which swaps the bare playground nav for the branded
 *   header and footer.
 *
 * `@codenhub/styles` is left to resolve to the package's built `dist/`, per
 * `docs/specs/packages-development.md`: a demo must never run against `src/`.
 */
function demoChrome(): Plugin {
  return {
    name: "styles-demo-chrome",
    resolveId(id) {
      return id === CHROME_IDS.standard || id === CHROME_IDS.native ? resolvedChromeId(id) : undefined;
    },
    load(id) {
      for (const chromeId of Object.values(CHROME_IDS)) {
        if (id !== resolvedChromeId(chromeId)) {
          continue;
        }
        const entryCss = chromeId === CHROME_IDS.native ? nativeEntryCss : sharedEntryCss;
        return [`import ${JSON.stringify(entryCss)};`, `import ${JSON.stringify(chromeEntry)};`].join("\n");
      }
      return undefined;
    },
    transform(code, id) {
      /* `entry-vanilla.css` ends with `@source` globs that let a Tailwind
         consumer regenerate fixture-only utilities. The demo bundles the
         already-compiled `dist/` where those utilities exist, so the globs are
         inert here -- and Vite's production CSS minifier errors on the unknown
         at-rule. Drop them for the demo only; `playground/` keeps them for the
         `dev` and `debug` Tailwind path. */
      if (!entryCssPaths.has(posix(id.split("?", 1)[0]))) {
        return undefined;
      }
      return { code: code.replace(/@source\s+("[^"]*"|'[^']*')\s*;?/g, ""), map: null };
    },
    transformIndexHtml: {
      /* `pre`, so the inline module script below is in the HTML before Vite's
         own build-html pass extracts and bundles module scripts, and so the
         classic `<script src>` tags are already inlined before Vite tries (and
         warns) that it cannot bundle them. */
      order: "pre",
      handler(html, ctx) {
        const isNative = ctx.path.includes("/native/");
        const chromeId = isNative ? CHROME_IDS.native : CHROME_IDS.standard;

        const withInlineScripts = html
          .replace('<script src="/shared/playground.js"></script>', `<script>\n${playgroundJs}\n</script>`)
          .replace('<script src="/shared/matrix.js"></script>', `<script>\n${matrixJs}\n</script>`);

        /* `entry-vanilla.css` is loaded through Vite by the chrome module, so
           swallow the root-absolute `<link>` `playground.js` writes for it --
           it would 404 under a mounted base and duplicate the sheet anywhere. */
        const bootstrap = [
          "(function () {",
          "  var url = new URL(window.location.href);",
          '  if (url.searchParams.get("env") !== "vanilla") {',
          '    url.searchParams.set("env", "vanilla");',
          '    window.history.replaceState(null, "", url);',
          "  }",
          "  var write = document.write.bind(document);",
          "  document.write = function (markup) {",
          "    var text = String(markup);",
          "    if (/entry-[\\w-]*\\.css/.test(text)) { return; }",
          "    return write(text);",
          "  };",
          "})();",
        ].join("\n");

        return {
          html: withInlineScripts,
          tags: [
            { tag: "script", injectTo: "head-prepend", children: bootstrap },
            {
              tag: "script",
              attrs: { type: "module" },
              children: `import ${JSON.stringify(chromeId)};`,
              injectTo: "head",
            },
          ],
        };
      },
    },
  };
}

export default defineConfig({
  root: playgroundRoot,
  publicDir: resolve(__dirname, "public"),
  plugins: [
    /* Draws the `ic-*` glyphs the forms fixtures and the theme toggle use,
       before `tailwindcss()`: both are `enforce: "pre"` and the icon `@import`
       has to resolve before Tailwind compiles the sheet. Only Lucide is
       registered. */
    viteIcons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: [...pages, chromeEntry],
    }),
    tailwindcss(),
    demoChrome(),
  ],
  server: {
    port: 5185,
    fs: {
      /* `chrome.ts`, `chrome.css`, and the playground entry stylesheets sit
         outside the playground `root`. */
      allow: [repoRoot],
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: pages,
    },
  },
});
