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
