import type { Plugin } from "postcss";

import { renderAttributionBanner, renderSuppressedAttributionWarning } from "../catalog/attribution.js";
import { IconRegistry } from "../core/registry.js";
import type { IconFamilyData } from "../core/types.js";
import { generateIconSetCss } from "../generator/css-generator.js";
import { scanFiles, scanIconClasses } from "../scanner/class-scanner.js";

/**
 * How the PostCSS plugin emits the license notices of the families it used.
 *
 * PostCSS has no asset pipeline, so the Vite plugin's `"file"` mode has no
 * equivalent here.
 */
export type PostcssAttributionMode = "auto" | "off";

/**
 * Options for configuring the PostCSS icons plugin.
 */
export interface PostcssIconsOptions {
  /**
   * File paths to scan for icon class names.
   */
  content?: string[];

  /**
   * Prefix for icon class names, as in `"ic"` for `.ic-close`. Defaults to `"ic"`.
   */
  prefix?: string;

  /**
   * Whether to inject the base icon rules (`.ic`). Defaults to `true`.
   */
  injectBase?: boolean;

  /**
   * Icon families to make resolvable, such as the default export of
   * `@codenhub/icons/data/lucide`.
   *
   * No family is bundled by default: a project declares the families it wants.
   */
  families?: IconFamilyData[];

  /**
   * Family prefix that unprefixed icon names resolve against.
   */
  defaultPrefix?: string;

  /**
   * Registry to resolve icons with, replacing the one built from
   * {@link PostcssIconsOptions.families}.
   */
  registry?: IconRegistry;

  /**
   * Stroke width applied to icons of stroke-based families.
   */
  strokeWidth?: number | string;

  /**
   * How license notices reach the output. `"auto"` prepends a preserved CSS
   * comment; `"off"` emits nothing and warns when a used family still requires
   * a notice. Defaults to `"auto"`.
   */
  attribution?: PostcssAttributionMode;
}

/**
 * The instantiated PostCSS icons plugin.
 */
export interface PostcssIconsPluginObject extends Plugin {
  postcssPlugin: string;
  Once: (root: { toString(): string; append(ast: unknown): void }, helpers?: { parse(css: string): unknown }) => void;
}

function createRegistry(options: PostcssIconsOptions): IconRegistry {
  if (options.registry) {
    return options.registry;
  }
  const registry = new IconRegistry({ defaultPrefix: options.defaultPrefix });
  for (const family of options.families ?? []) {
    registry.registerFamily(family);
  }
  return registry;
}

/**
 * PostCSS plugin that scans the stylesheet and the configured files for icon
 * classes, then appends the base rules and the mask rules those classes need.
 *
 * It also carries the license notices required by the families the stylesheet
 * actually used, unless attribution is turned off.
 *
 * @param options - Families, scanning, class prefix, and attribution.
 * @returns The PostCSS plugin.
 */
export const postcssIcons = (options: PostcssIconsOptions = {}): PostcssIconsPluginObject => {
  const prefix = options.prefix ?? "ic";
  const injectBase = options.injectBase ?? true;
  const registry = createRegistry(options);
  const contentPaths = options.content ?? [];
  const attributionMode = options.attribution ?? "auto";

  return {
    postcssPlugin: "postcss-codenhub-icons",
    Once(root, helpers) {
      const foundClasses = scanIconClasses(root.toString(), { prefix });
      scanFiles(contentPaths, { prefix }, foundClasses);

      if (foundClasses.size === 0 && !injectBase) {
        return;
      }

      const { css, families } = generateIconSetCss(foundClasses, registry, {
        injectBase,
        prefix,
        strokeWidth: options.strokeWidth,
      });
      if (!css) {
        return;
      }

      const banner = attributionMode === "auto" ? renderAttributionBanner(families) : undefined;
      if (attributionMode === "off") {
        const warning = renderSuppressedAttributionWarning(families);
        if (warning) {
          console.warn(`[postcss-codenhub-icons] ${warning}`);
        }
      }

      const output = banner === undefined ? css : `${banner}\n${css}`;
      if (helpers && typeof helpers.parse === "function") {
        root.append(helpers.parse(output));
        return;
      }
      root.append(output);
    },
  };
};

postcssIcons.postcss = true;

/**
 * Named alias for {@link postcssIcons}.
 */
export const postcssIconsPlugin = postcssIcons;
export default postcssIcons;
