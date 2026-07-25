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

  /**
   * Default global stroke width for configurable icons.
   */
  strokeWidth?: number | string;
}

/**
 * Modifies an SVG string to change its stroke-width attributes.
 * If stroke-width is not defined on the SVG, it will be added to the root element.
 *
 * @param svg - The original SVG string content.
 * @param strokeWidth - The new stroke width to apply.
 * @returns The modified SVG string.
 */
export function setSvgStrokeWidth(svg: string, strokeWidth: number | string): string {
  if (svg.includes("stroke-width=")) {
    return svg.replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`);
  }
  return svg.replace(/<svg([^>]*)>/i, (_, attrs) => `<svg${attrs} stroke-width="${strokeWidth}">`);
}

/**
 * Escapes characters in a CSS class name so it can be safely used in a selector.
 * Especially escapes dots in floating point stroke width classes (e.g. `ic-stroke-1.5` -> `ic-stroke-1\.5`).
 *
 * @param cls - The class name to escape.
 * @returns The escaped selector part.
 */
export function escapeSelectorClass(cls: string): string {
  return cls.replace(/\./g, "\\.");
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
  const strokePrefix = `${prefixDash}stroke-`;

  const strokeValues = new Set<string>();
  const iconClasses = new Set<string>();

  for (const cls of classes) {
    if (!cls.startsWith(prefixDash)) {
      continue;
    }
    if (cls.startsWith(strokePrefix)) {
      const valStr = cls.slice(strokePrefix.length);
      if (/^[0-9]+(?:\.[0-9]+)?$/.test(valStr)) {
        strokeValues.add(valStr);
      }
    } else {
      iconClasses.add(cls);
    }
  }

  for (const cls of iconClasses) {
    const iconName = cls.slice(prefixDash.length);
    const resolved = registry.resolve(iconName);

    if (resolved) {
      // 1. Base rule with default / global override stroke width
      let baseSvg = resolved.svg;
      if (resolved.strokeConfigurable) {
        const defaultStrokeWidth = options?.strokeWidth ?? registry.options?.strokeWidth;
        if (defaultStrokeWidth !== undefined) {
          baseSvg = setSvgStrokeWidth(baseSvg, defaultStrokeWidth);
        }
      }

      const selector = `.${cls}`;
      const existing = svgToSelectorsMap.get(baseSvg);
      if (existing) {
        existing.push(selector);
      } else {
        svgToSelectorsMap.set(baseSvg, [selector]);
      }

      // 2. Combined rules for other stroke-widths if icon is stroke-configurable
      if (resolved.strokeConfigurable) {
        for (const strokeVal of strokeValues) {
          const strokeClass = `${strokePrefix}${strokeVal}`;
          const combinedSelector = `.${cls}.${escapeSelectorClass(strokeClass)}`;
          const strokeSvg = setSvgStrokeWidth(resolved.svg, strokeVal);

          const existingStroke = svgToSelectorsMap.get(strokeSvg);
          if (existingStroke) {
            existingStroke.push(combinedSelector);
          } else {
            svgToSelectorsMap.set(strokeSvg, [combinedSelector]);
          }
        }
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
