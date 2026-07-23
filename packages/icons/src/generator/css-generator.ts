import type { IconRegistry } from "../registry/registry.js";
import { svgToDataUri } from "./svg-encoder.js";

/**
 * Options for generating base CSS icon rules.
 */
export interface BaseCssOptions {
  /**
   * Class prefix for base icon styles. Defaults to `"ic"`.
   */
  prefix?: string;
}

/**
 * Options for generating CSS rules for a collection of icon class names.
 */
export interface GenerateIconSetCssOptions extends BaseCssOptions {
  /**
   * Whether to include base CSS container rules (`.ic`). Defaults to `true`.
   */
  injectBase?: boolean;
}

/**
 * Generates base CSS rules for icon containers using CSS mask properties.
 *
 * @param options - Options object specifying icon prefix.
 * @returns Generated CSS rule string for base icon styling.
 */
export function generateBaseCss(options?: BaseCssOptions): string {
  const prefix = options?.prefix ?? "ic";
  return `.${prefix},
[class^="${prefix}-"],
[class*=" ${prefix}-"] {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  background-color: currentColor;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: 100% 100%;
}`;
}

/**
 * Generates CSS mask rules for specific icon selectors and an SVG string.
 *
 * @param selectors - Single CSS selector or array of selectors (e.g. `".ic-close"` or `[".ic-close", ".ic-x"]`).
 * @param svg - The SVG string content for the icon.
 * @returns Generated CSS rule string.
 */
export function generateIconCss(selectors: string | string[], svg: string): string {
  const selectorList = Array.isArray(selectors) ? selectors.join(",\n") : selectors;
  const uri = svgToDataUri(svg);
  return `${selectorList} {
  mask-image: url("${uri}");
  -webkit-mask-image: url("${uri}");
}`;
}

/**
 * Generates combined CSS rules for a collection of scanned icon class names using an `IconRegistry`.
 * Groups icon class selectors sharing identical SVG content to maximize CSS mask deduplication.
 *
 * @param classes - Iterable collection of icon class names (e.g. `["ic-close", "ic-user"]`).
 * @param registry - `IconRegistry` instance used to resolve icon definitions.
 * @param options - Configuration options for class prefix and base style injection.
 * @returns Generated CSS string containing base container styles and icon mask rules.
 */
export function generateIconSetCss(
  classes: Iterable<string>,
  registry: IconRegistry,
  options?: GenerateIconSetCssOptions,
): string {
  const prefix = options?.prefix ?? "ic";
  const injectBase = options?.injectBase ?? true;

  const svgToSelectorsMap = new Map<string, string[]>();
  const prefixDash = `${prefix}-`;

  for (const cls of classes) {
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

  return cssChunks.join("\n\n");
}
