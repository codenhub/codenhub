import fs from "node:fs";

import type { Plugin } from "postcss";

import { generateBaseCss, generateIconCss } from "../generator/css-generator.js";
import { lucideProvider } from "../registry/providers/lucide.js";
import { IconRegistry } from "../registry/registry.js";
import { scanIconClasses } from "../scanner/class-scanner.js";

/**
 * Options for configuring the PostCSS icons plugin.
 */
export interface PostcssIconsOptions {
  /**
   * List of file paths to scan for icon class names.
   */
  content?: string[];

  /**
   * Prefix for icon class names (e.g. `"ic"` for `.ic-close`). Defaults to `"ic"`.
   */
  prefix?: string;

  /**
   * Whether to inject base icon styles (`.ic`). Defaults to `true`.
   */
  injectBase?: boolean;

  /**
   * Custom `IconRegistry` instance used to resolve icons.
   * If omitted, a default registry pre-configured with `lucideProvider` is used.
   */
  registry?: IconRegistry;
}

/**
 * Interface representing the instantiated PostCSS icons plugin.
 */
export interface PostcssIconsPluginObject extends Plugin {
  postcssPlugin: string;
  Once: (root: { toString(): string; append(ast: unknown): void }, helpers?: { parse(css: string): unknown }) => void;
}

const defaultRegistry = new IconRegistry();
defaultRegistry.registerProvider(lucideProvider);

/**
 * PostCSS plugin that scans CSS content and configured files for icon class usages,
 * resolves icon SVGs from an `IconRegistry`, and appends base icon styles and
 * mask rules directly to the PostCSS AST.
 *
 * @param options - Configuration options for content paths, class prefix, and icon registry.
 * @returns PostCSS plugin object.
 */
export const postcssIcons = (options: PostcssIconsOptions = {}): PostcssIconsPluginObject => {
  const prefix = options.prefix ?? "ic";
  const injectBase = options.injectBase ?? true;
  const registry = options.registry ?? defaultRegistry;
  const contentPaths = options.content ?? [];

  return {
    postcssPlugin: "postcss-codenhub-icons",
    Once(root, helpers) {
      const foundClasses = new Set<string>();

      // 1. Scan inline CSS root content
      const cssString = root.toString();
      const cssMatches = scanIconClasses(cssString, { prefix });
      for (const cls of cssMatches) {
        foundClasses.add(cls);
      }

      // 2. Scan external files specified in options.content
      for (const filePath of contentPaths) {
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const fileMatches = scanIconClasses(fileContent, { prefix });
            for (const cls of fileMatches) {
              foundClasses.add(cls);
            }
          }
        } catch {
          // Ignore unreadable files gracefully
        }
      }

      if (foundClasses.size === 0 && !injectBase) {
        return;
      }

      // Group icon class selectors by resolved SVG content to maximize CSS deduplication
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

      const cssChunks: string[] = [];
      if (injectBase) {
        cssChunks.push(generateBaseCss({ prefix }));
      }

      for (const [svg, selectors] of svgToSelectorsMap.entries()) {
        cssChunks.push(generateIconCss(selectors, svg));
      }

      if (cssChunks.length === 0) {
        return;
      }

      const generatedCss = cssChunks.join("\n\n");
      if (helpers && typeof helpers.parse === "function") {
        const generatedAst = helpers.parse(generatedCss);
        root.append(generatedAst);
      } else {
        root.append(generatedCss);
      }
    },
  };
};

postcssIcons.postcss = true;
export const postcssIconsPlugin = postcssIcons;
export default postcssIcons;
