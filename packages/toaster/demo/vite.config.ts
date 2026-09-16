import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { IconFamilyData } from "@codenhub/icons";
import { viteIcons } from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import lucide from "../../icons/data/lucide/icons.json" with { type: "json" };

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/* The demo is the playground worn as a deployable reference: the same page,
   rendered against the built `dist/` a consumer installs, under a branded
   shell. Pointing `root` at the playground keeps a single copy of the toast
   trigger UI -- the demo owns only its chrome, and nothing under
   `playground/` changes. */
const playgroundRoot = resolve(__dirname, "../playground");
const chromeEntry = resolve(__dirname, "chrome.ts");

const CHROME_ID = "virtual:toaster-demo-chrome";
/** The `\0`-prefixed internal id Rollup uses for a resolved virtual module. */
const resolvedChromeId = `\0${CHROME_ID}`;

/**
 * Layers the deployable shell over the reused playground page.
 *
 * `playground/index.ts` still owns every trigger and dispatch option. The
 * playground's markup is static (no header/toggle built at runtime), so
 * unlike the theme demo's chrome, this one needs no ready event: it runs
 * once on load, moves the existing `#btn-toggle-theme` button into the
 * branded header, and prepends/appends the header and footer around the
 * page's existing content.
 */
function demoChrome(): Plugin {
  return {
    name: "toaster-demo-chrome",
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
  /* `apps/demo` mounts this build at `/toaster/`, the package directory
     name, per the URL scheme in `docs/specs/packages-demo.md`. */
  base: "/toaster/",
  root: playgroundRoot,
  publicDir: resolve(__dirname, "public"),
  plugins: [
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
    /* `@codenhub/toaster` resolves normally to this package's own built
       `dist/` via its `exports`, per `docs/specs/packages-development.md`: a
       demo must never run against `src/`. `@codenhub/styles` is a
       dependency of the reused playground page, not the package under
       inspection here, so it keeps resolving the same way `dev`/`debug` do:
       `/tw` to its Tailwind JIT source -- required for the playground's own
       raw utility classes to compile at all, since the pre-built `dist/` CSS
       is scanned only from `packages/styles/src/**` and never sees this
       page's markup. */
    alias: {
      "@codenhub/styles/tw/native": resolve(__dirname, "../../styles/src/native.css"),
      "@codenhub/styles/tw": resolve(__dirname, "../../styles/src/index.css"),
      "@codenhub/styles/native": resolve(__dirname, "../../styles/dist/native.css"),
      "@codenhub/styles": resolve(__dirname, "../../styles/dist/index.css"),
    },
  },
  server: {
    port: 5192,
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
