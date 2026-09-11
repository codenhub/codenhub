import { globSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import lucide from "@codenhub/icons/data/lucide";
import { viteIcons } from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/* `apps/demo` mounts this build at `/styles/`, the package directory name, per
   the URL scheme in `docs/specs/packages-demo.md`. */
const BASE = "/styles/";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/* The demo is the playground worn as a deployable reference: the same fixture
   pages and the same `shared/matrix.js` spec, rendered against the built
   `dist/` CSS a consumer installs, under a branded shell. Pointing `root` at
   the playground keeps a single copy of every fixture -- the demo owns only
   its chrome, and nothing under `playground/` changes. */
const playgroundRoot = resolve(__dirname, "../playground");
const pages = globSync("**/*.html", { cwd: playgroundRoot }).map((file) => resolve(playgroundRoot, file));

/** Normalise a filesystem path to forward slashes, so it compares against Vite ids on Windows. */
const posix = (path: string): string => path.replace(/\\/g, "/");
const chromeEntry = resolve(__dirname, "chrome.ts");
const sharedEntryCss = resolve(playgroundRoot, "shared/entry-vanilla.css");
const nativeEntryCss = resolve(playgroundRoot, "native/entry-vanilla.css");
const entryCssPaths = new Set([posix(sharedEntryCss), posix(nativeEntryCss)]);

const CHROME_IDS = {
  native: "virtual:styles-demo-chrome-native",
  standard: "virtual:styles-demo-chrome",
} as const;
/** The `\0`-prefixed internal id Rollup uses for a resolved virtual module. */
const resolvedChromeId = (id: string): string => `\0${id}`;

/**
 * Layers the deployable shell over the reused playground pages.
 *
 * - `playground.js` and `matrix.js` are real ES modules, so Vite bundles them
 *   as ordinary entry-graph modules like any other `type="module"` script --
 *   nothing in this plugin needs to touch them.
 * - Drops `env-stylesheet.js`, the one script that stays a classic,
 *   `document.write`-ing script rather than a module (see its own comment for
 *   why): it exists to pick between the vanilla and built Tailwind CSS during
 *   local development, a comparison a deployed demo has no use for. Leaving it
 *   out is also what makes `playground.js` default to the "vanilla" build --
 *   see its own comment.
 * - Loads the compiled `entry-vanilla.css` through Vite instead, so it is a
 *   real stylesheet link that also resolves once mounted under `/<slug>/`.
 * - Injects `chrome.ts`, which listens for the `playground:nav-ready` event
 *   `playground.js` dispatches and swaps the bare nav it hands over for the
 *   branded header and footer.
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
      /* `pre`, so `env-stylesheet.js`'s tag is gone before Vite's own
         build-html pass scans the page for scripts it can bundle -- left in
         place, that scan warns it cannot bundle a classic script it was never
         going to keep anyway. */
      order: "pre",
      handler(html, ctx) {
        const isNative = ctx.path.includes("/native/");
        const chromeId = isNative ? CHROME_IDS.native : CHROME_IDS.standard;

        return {
          html: html.replace('<script src="/shared/env-stylesheet.js"></script>', ""),
          tags: [
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
  /* `chrome.ts` reads `import.meta.env.BASE_URL`, which Vite fills from this,
     so the stylesheet URLs it builds follow without a second source of truth. */
  base: BASE,
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
