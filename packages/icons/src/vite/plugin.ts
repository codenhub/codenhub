import fs from "node:fs";

import type { Plugin } from "vite";

import { generateBaseCss, generateIconCss } from "../generator/css-generator.js";
import { lucideProvider } from "../registry/providers/lucide.js";
import { IconRegistry } from "../registry/registry.js";
import { scanIconClasses } from "../scanner/class-scanner.js";

/**
 * Options for configuring the Vite icons plugin.
 */
export interface ViteIconsOptions {
  /**
   * List of file paths or glob patterns to scan for icon class names.
   */
  content?: string[];

  /**
   * Prefix for icon class names (e.g. `"ic"` for `.ic-close`). Defaults to `"ic"`.
   */
  prefix?: string;

  /**
   * Custom `IconRegistry` instance used to resolve icons.
   * Defaults to a registry instance initialized with `lucideProvider`.
   */
  registry?: IconRegistry;
}

const VIRTUAL_ID = "virtual:icons.css";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;

const defaultRegistry = new IconRegistry();
defaultRegistry.registerProvider(lucideProvider);

/**
 * Vite plugin that serves generated icon CSS through virtual module `virtual:icons.css`
 * or replaces `@import "@codenhub/icons";` / `@import "@codenhub/icons/style.css";` directives,
 * with HMR support in development mode.
 *
 * @param options - Configuration options for content scanning, class prefix, and icon registry.
 * @returns Vite plugin object.
 */
export function viteIcons(options: ViteIconsOptions = {}): Plugin {
  const prefix = options.prefix ?? "ic";
  const registry = options.registry ?? defaultRegistry;
  const contentPaths = options.content ?? [];

  const scannedFiles = new Set<string>();
  const inMemoryClasses = new Set<string>();

  function generateCssFromContent(): string {
    const foundClasses = new Set<string>(inMemoryClasses);

    // 1. Scan files specified in options.content
    for (const filePath of contentPaths) {
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const fileContent = fs.readFileSync(filePath, "utf-8");
          const matches = scanIconClasses(fileContent, { prefix });
          for (const cls of matches) {
            foundClasses.add(cls);
          }
        }
      } catch {
        // Ignore unreadable files
      }
    }

    // 2. Scan tracked runtime files in Vite project
    for (const filePath of scannedFiles) {
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const fileContent = fs.readFileSync(filePath, "utf-8");
          const matches = scanIconClasses(fileContent, { prefix });
          for (const cls of matches) {
            foundClasses.add(cls);
          }
        }
      } catch {
        // Ignore unreadable files
      }
    }

    if (foundClasses.size === 0) {
      return generateBaseCss({ prefix });
    }

    const svgToSelectorsMap = new Map<string, string[]>();
    const prefixDash = `${prefix}-`;

    for (const cls of foundClasses) {
      if (!cls.startsWith(prefixDash)) {
        continue;
      }

      const iconName = cls.slice(prefixDash.length);
      const resolved = registry.resolve(iconName);

      if (resolved) {
        const selector = `.${cls}`;
        const existing = svgToSelectorsMap.get(resolved.svg);
        if (existing) {
          existing.push(selector);
        } else {
          svgToSelectorsMap.set(resolved.svg, [selector]);
        }
      }
    }

    const cssChunks: string[] = [generateBaseCss({ prefix })];

    for (const [svg, selectors] of svgToSelectorsMap.entries()) {
      cssChunks.push(generateIconCss(selectors, svg));
    }

    return cssChunks.join("\n\n");
  }

  return {
    name: "codenhub-icons",
    enforce: "pre",

    resolveId(id: string) {
      const rawId = id.replace(/^\//, "").replace(/^@id\//, "");
      if (
        rawId === "virtual:icons.css" ||
        rawId === "virtual:codenhub-icons.css" ||
        rawId === "virtual:@codenhub/icons.css" ||
        rawId === "@codenhub/icons/style.css" ||
        id.endsWith("virtual:icons.css") ||
        id.endsWith("@codenhub/icons/style.css")
      ) {
        return "\0" + rawId;
      }
      return null;
    },

    load(id: string) {
      if (id.startsWith("\0virtual:") || id.startsWith("\0@codenhub/icons/") || id === RESOLVED_VIRTUAL_ID) {
        return generateCssFromContent();
      }
      return null;
    },

    transformIndexHtml(html, ctx) {
      const scanned = scanIconClasses(html, { prefix });
      for (const cls of scanned) {
        inMemoryClasses.add(cls);
      }
      if (ctx.filename) {
        scannedFiles.add(ctx.filename);
      }

      return [
        {
          tag: "style",
          attrs: { id: "codenhub-icons" },
          children: generateCssFromContent(),
          injectTo: "head",
        },
      ];
    },

    transform(code, id) {
      const scanned = scanIconClasses(code, { prefix });
      for (const cls of scanned) {
        inMemoryClasses.add(cls);
      }

      // Track source files for scanning if id is provided
      if (
        id &&
        !id.includes("node_modules") &&
        !id.startsWith("\0") &&
        /\.(html|jsx?|tsx?|vue|svelte|css|scss|sass|less)$/i.test(id)
      ) {
        scannedFiles.add(id);
      }

      // Replace `@import "@codenhub/icons";` or `@import "@codenhub/icons/style.css";`
      if (id && (id.endsWith(".css") || id.endsWith(".scss") || id.endsWith(".sass") || id.endsWith(".less"))) {
        const importPattern =
          /@import\s+["'](?:@codenhub\/icons|@codenhub\/icons\/style\.css|virtual:icons\.css)["'];?/g;
        if (importPattern.test(code)) {
          const generated = generateCssFromContent();
          return {
            code: code.replace(importPattern, generated),
            map: null,
          };
        }
      }

      return null;
    },

    configureServer(server) {
      const handleFileChange = (filePath: string) => {
        if (filePath.includes("node_modules") || !/\.(html|jsx?|tsx?|vue|svelte|css|scss|sass|less)$/i.test(filePath)) {
          return;
        }

        scannedFiles.add(filePath);

        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          server.ws.send({
            type: "update",
            updates: [
              {
                type: "js-update",
                path: mod.url,
                acceptedPath: mod.url,
                timestamp: Date.now(),
              },
            ],
          });
        }
      };

      server.watcher.on("change", handleFileChange);
      server.watcher.on("add", handleFileChange);
    },
  };
}

export const viteIconsPlugin = viteIcons;

export default viteIcons;
