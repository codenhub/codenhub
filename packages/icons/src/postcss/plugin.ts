import type { Plugin } from "postcss";

import { generateIconSetCss } from "../generator/css-generator.js";
import { lucideProvider } from "../registry/providers/lucide/index.js";
import { IconRegistry } from "../registry/registry.js";
import { scanFiles, scanIconClasses } from "../scanner/class-scanner.js";

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
      // 1. Scan inline CSS root content
      const foundClasses = scanIconClasses(root.toString(), { prefix });

      // 2. Scan external files specified in options.content
      scanFiles(contentPaths, { prefix }, foundClasses);

      if (foundClasses.size === 0 && !injectBase) {
        return;
      }

      const generatedCss = generateIconSetCss(foundClasses, registry, { prefix, injectBase });
      if (!generatedCss) {
        return;
      }

      if (helpers && typeof helpers.parse === "function") {
        root.append(helpers.parse(generatedCss));
      } else {
        root.append(generatedCss);
      }
    },
  };
};

postcssIcons.postcss = true;
export const postcssIconsPlugin = postcssIcons;
export default postcssIcons;
