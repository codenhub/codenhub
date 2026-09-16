import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { IconFamilyData } from "@codenhub/icons";
import { viteIcons } from "@codenhub/icons/vite";
import { iconsPlugin } from "@codenhub/vite-plugin-icons";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import lucide from "../../icons/data/lucide/icons.json" with { type: "json" };

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/* The demo is the playground worn as a deployable reference: the same page,
   rendered against the built `dist/` CSS a consumer installs, under a
   branded shell. Pointing `root` at the playground keeps a single copy of
   the theme CRUD UI -- the demo owns only its chrome, and nothing under
   `playground/` changes. */
const playgroundRoot = resolve(__dirname, "../playground");
const chromeEntry = resolve(__dirname, "chrome.ts");

const CHROME_ID = "virtual:theme-demo-chrome";
/** The `\0`-prefixed internal id Rollup uses for a resolved virtual module. */
const resolvedChromeId = `\0${CHROME_ID}`;

/**
 * Layers the deployable shell over the reused playground page.
 *
 * `playground/index.ts` still owns all theme CRUD and token logic. It
 * dispatches `theme-playground:ready` once `.playground-header` and its
 * controls are wired; `chrome.ts` listens for that event and swaps the bare
 * header for the branded app-shell one, reusing the controls handed over in
 * the event rather than re-querying the DOM.
 */
function demoChrome(): Plugin {
  return {
    name: "theme-demo-chrome",
    resolveId(id) {
      return id === CHROME_ID ? resolvedChromeId : undefined;
    },
    load(id) {
      return id === resolvedChromeId ? `import ${JSON.stringify(chromeEntry)};` : undefined;
    },
    transformIndexHtml: {
      /* `pre`, so this tag is in place before Vite's own build-html pass
         scans the page for scripts it can bundle. */
      order: "pre",
      handler() {
        return {
          tags: [
            {
              tag: "script",
              attrs: { type: "module" },
              children: `import ${JSON.stringify(CHROME_ID)};`,
              injectTo: "head",
            },
          ],
        };
      },
    },
  };
}

export default defineConfig({
  /* `apps/demo` mounts this build at `/theme/`, the package directory name,
     per the URL scheme in `docs/specs/packages-demo.md`. */
  base: "/theme/",
  root: playgroundRoot,
  publicDir: resolve(__dirname, "public"),
  plugins: [
    /* Draws the playground's own `ic-*` glyphs (settings, plus, x, contrast,
       trash, pencil), matching what `dev`/`debug` register. */
    iconsPlugin(),
    /* Draws the chrome's `ic-lucide-*` glyphs (nav arrow, theme-switch sun/moon). */
    viteIcons({
      families: [lucide as IconFamilyData],
      defaultPrefix: "lucide",
      content: [chromeEntry],
    }),
    tailwindcss(),
    demoChrome(),
  ],
  resolve: {
    /* `@codenhub/theme` is left to resolve normally, to this package's own
       built `dist/` via its `exports`, per `docs/specs/packages-development.md`:
       a demo must never run against `src/`. `@codenhub/styles` is a
       dependency of the reused playground page, not the package under
       inspection here, so it keeps resolving the same way `dev`/`debug` do:
       `/tw` to its Tailwind JIT source -- required for the playground's own
       raw utility classes (e.g. its `max-w-[80rem]` container) to compile at
       all, since the pre-built `dist/` CSS is scanned only from
       `packages/styles/src/**` and never sees this page's markup. */
    alias: {
      "@codenhub/styles/tw/native": resolve(__dirname, "../../styles/src/native.css"),
      "@codenhub/styles/tw": resolve(__dirname, "../../styles/src/index.css"),
      "@codenhub/styles/native": resolve(__dirname, "../../styles/dist/native.css"),
      "@codenhub/styles": resolve(__dirname, "../../styles/dist/index.css"),
    },
  },
  server: {
    port: 5191,
    fs: {
      /* `chrome.ts`, `chrome.css`, and `public/` sit outside the playground `root`. */
      allow: [repoRoot],
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
