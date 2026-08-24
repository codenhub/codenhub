import { resolveIconClassName } from "../core/class-names.js";
import type { IconRegistry } from "../core/registry.js";
import { renderSvg } from "../core/render.js";
import type { IconFamilyData } from "../core/types.js";
import { svgToDataUri } from "./svg-encoder.js";

const DEFAULT_PREFIX = "ic";
const STROKE_VALUE = /^[0-9]+(?:\.[0-9]+)?$/;

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
 * Options for generating the CSS rule of a single icon.
 */
export interface GenerateIconCssOptions {
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
   * Whether to include the base container rules (`.ic`). Defaults to `true`.
   */
  injectBase?: boolean;

  /**
   * Stroke width applied to icons of stroke-based families. Icons of families
   * drawn as filled paths are unaffected.
   */
  strokeWidth?: number | string;
}

/**
 * Generated icon CSS together with the families it drew from.
 */
export interface IconSetCssResult {
  /**
   * The generated stylesheet.
   */
  css: string;

  /**
   * Families the generated rules resolved icons from, so callers can emit the
   * license notices those families require.
   */
  families: IconFamilyData[];
}

/**
 * Escapes characters in a CSS class name so it can be used in a selector.
 *
 * Stroke width classes carry a dot, as in `ic-stroke-1.5`, which a selector
 * would otherwise read as a second class.
 *
 * @param className - Class name to escape.
 * @returns The escaped selector fragment.
 */
export function escapeSelectorClass(className: string): string {
  return className.replace(/\./g, "\\.");
}

/**
 * Generates the base rules every icon class builds on, covering standalone
 * elements, `::before` and `::after` pseudo-elements, and form controls that
 * take a `background-image`.
 *
 * @param options - Class prefix.
 * @returns The base stylesheet.
 */
export function generateBaseCss(options?: BaseCssOptions): string {
  const p = options?.prefix ?? DEFAULT_PREFIX;
  return `i[class^="${p}-"],
i[class*=" ${p}-"],
.${p} {
  display: inline-block;
  width: var(--${p}-size, 1em);
  height: var(--${p}-size, 1em);
  vertical-align: -0.125em;
  background-color: var(--${p}-color, currentColor);
  mask-image: var(--${p}-mask);
  -webkit-mask-image: var(--${p}-mask);
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: 100% 100%;
}

:not(i, input, select, textarea, .${p})[class^="${p}-"]::before,
:not(i, input, select, textarea, .${p})[class*=" ${p}-"]::before {
  content: "";
  display: inline-block;
  width: var(--${p}-size, 1em);
  height: var(--${p}-size, 1em);
  vertical-align: -0.125em;
  background-color: var(--${p}-color, currentColor);
  mask-image: var(--${p}-mask);
  -webkit-mask-image: var(--${p}-mask);
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: 100% 100%;
}

:not(i, input, select, textarea, .${p})[class*="${p}-after"]::before,
:not(i, input, select, textarea, .${p})[class*=" ${p}-after"]::before,
.${p}-after::before {
  display: none !important;
}

:not(i, input, select, textarea, .${p})[class*="${p}-after"]::after,
:not(i, input, select, textarea, .${p})[class*=" ${p}-after"]::after,
.${p}-after::after {
  content: "";
  display: inline-block;
  width: var(--${p}-size, 1em);
  height: var(--${p}-size, 1em);
  vertical-align: -0.125em;
  background-color: var(--${p}-color, currentColor);
  mask-image: var(--${p}-mask);
  -webkit-mask-image: var(--${p}-mask);
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: 100% 100%;
}

input[class^="${p}-"],
input[class*=" ${p}-"],
select[class^="${p}-"],
select[class*=" ${p}-"],
textarea[class^="${p}-"],
textarea[class*=" ${p}-"],
.${p}-bg {
  background-image: var(--${p}-uri);
  background-repeat: no-repeat;
}`;
}

/**
 * Generates the custom property rule that carries one icon's artwork.
 *
 * @param selectors - Selector or selectors the rule applies to.
 * @param svg - Complete SVG markup for the icon.
 * @param options - Class prefix.
 * @returns The generated rule.
 */
export function generateIconCss(selectors: string | string[], svg: string, options?: GenerateIconCssOptions): string {
  const selectorList = Array.isArray(selectors) ? selectors.join(",\n") : selectors;
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  return `${selectorList} {
  --${prefix}-uri: url("${svgToDataUri(svg)}");
  --${prefix}-mask: var(--${prefix}-uri);
}`;
}

interface ScannedClasses {
  iconClasses: Set<string>;
  strokeValues: Set<string>;
}

function partitionClasses(classes: Iterable<string>, prefix: string): ScannedClasses {
  const prefixDash = `${prefix}-`;
  const strokePrefix = `${prefixDash}stroke-`;
  const iconClasses = new Set<string>();
  const strokeValues = new Set<string>();

  for (const className of classes) {
    if (!className.startsWith(prefixDash)) {
      continue;
    }
    if (className.startsWith(strokePrefix)) {
      const value = className.slice(strokePrefix.length);
      if (STROKE_VALUE.test(value)) {
        strokeValues.add(value);
      }
      continue;
    }
    iconClasses.add(className);
  }

  return { iconClasses, strokeValues };
}

/**
 * Generates the stylesheet for a set of scanned icon classes.
 *
 * Icons sharing identical markup are grouped into one rule, so a class and its
 * aliases cost a selector rather than a second copy of the artwork. Classes
 * that resolve to no icon are skipped silently, because a scanner reports every
 * prefixed class it sees, including ones that are not icons.
 *
 * @param classes - Scanned class names, including stroke width classes.
 * @param registry - Registry holding the loaded families.
 * @param options - Class prefix, base rule injection, and stroke width.
 * @returns The stylesheet and the families it drew from.
 */
export function generateIconSetCss(
  classes: Iterable<string>,
  registry: IconRegistry,
  options?: GenerateIconSetCssOptions,
): IconSetCssResult {
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  const injectBase = options?.injectBase ?? true;
  const { iconClasses, strokeValues } = partitionClasses(classes, prefix);

  const rulesBySvg = new Map<string, string[]>();
  const usedPrefixes = new Set<string>();

  function addRule(svg: string, selector: string): void {
    const selectors = rulesBySvg.get(svg);
    if (selectors) {
      selectors.push(selector);
      return;
    }
    rulesBySvg.set(svg, [selector]);
  }

  for (const className of iconClasses) {
    const icon = resolveIconClassName(registry, className.slice(prefix.length + 1));
    if (!icon) {
      continue;
    }
    usedPrefixes.add(icon.prefix);

    const isStrokeConfigurable = icon.strokeWidth !== undefined;
    addRule(renderSvg(icon, { strokeWidth: options?.strokeWidth }), `.${escapeSelectorClass(className)}`);

    if (!isStrokeConfigurable) {
      continue;
    }
    for (const strokeValue of strokeValues) {
      const strokeClass = escapeSelectorClass(`${prefix}-stroke-${strokeValue}`);
      addRule(renderSvg(icon, { strokeWidth: strokeValue }), `.${escapeSelectorClass(className)}.${strokeClass}`);
    }
  }

  const chunks = injectBase ? [generateBaseCss({ prefix })] : [];
  for (const [svg, selectors] of rulesBySvg) {
    chunks.push(generateIconCss(selectors, svg, { prefix }));
  }

  return {
    css: chunks.join("\n\n"),
    families: [...usedPrefixes]
      .toSorted((first, second) => first.localeCompare(second))
      .flatMap((usedPrefix) => registry.getFamily(usedPrefix) ?? []),
  };
}

/**
 * Resolves an icon name or raw SVG into a CSS `url()` carrying its artwork.
 *
 * @param iconNameOrSvg - Icon name, class-style name, or complete SVG markup.
 * @param registry - Registry used when a name has to be resolved.
 * @param options - Stroke width for stroke-based families.
 * @returns The `url()` value, or `undefined` when the name resolves to no icon.
 */
export function getIconMaskUrl(
  iconNameOrSvg: string,
  registry?: IconRegistry,
  options?: { strokeWidth?: number | string },
): string | undefined {
  if (iconNameOrSvg.startsWith("<svg")) {
    return `url("${svgToDataUri(iconNameOrSvg)}")`;
  }
  if (!registry) {
    return undefined;
  }

  const icon = resolveIconClassName(registry, iconNameOrSvg);
  if (!icon) {
    return undefined;
  }

  return `url("${svgToDataUri(renderSvg(icon, { strokeWidth: options?.strokeWidth }))}")`;
}

/**
 * Resolves an icon into the custom properties an inline `style` attribute or a
 * CSS-in-JS object needs to render it.
 *
 * @param iconNameOrSvg - Icon name, class-style name, or complete SVG markup.
 * @param registry - Registry used when a name has to be resolved.
 * @param options - Class prefix and stroke width.
 * @returns The custom properties, or `undefined` when the name resolves to no icon.
 */
export function getIconCssProps(
  iconNameOrSvg: string,
  registry?: IconRegistry,
  options?: { prefix?: string; strokeWidth?: number | string },
): Record<string, string> | undefined {
  const maskUrl = getIconMaskUrl(iconNameOrSvg, registry, options);
  if (!maskUrl) {
    return undefined;
  }

  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  return { [`--${prefix}-mask`]: `var(--${prefix}-uri)`, [`--${prefix}-uri`]: maskUrl };
}
