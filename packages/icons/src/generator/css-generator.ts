import { describeFamilyNotice } from "../catalog/attribution.js";
import { parseIconClass, resolveIconClassName } from "../core/class-names.js";
import { IconRegistry as IconRegistryConstructor } from "../core/registry.js";
import type { IconRegistry } from "../core/registry.js";
import { renderSvg } from "../core/render.js";
import type { IconFamilyData } from "../core/types.js";
import { svgToDataUri } from "./svg-encoder.js";

const DEFAULT_PREFIX = "ic";

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
   * Stroke width applied to icons of stroke-based families that carry no stroke
   * modifier of their own. Icons of families drawn as filled paths are
   * unaffected.
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
 * A stroke modifier contributes both characters that need it: `ic-heart/1.5`
 * carries a slash a selector would read as the start of a comment, and a dot it
 * would read as a second class.
 *
 * @param className - Class name to escape.
 * @returns The escaped selector fragment.
 */
export function escapeSelectorClass(className: string): string {
  return className.replace(/[./]/g, "\\$&");
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

/**
 * Generates the stylesheet for a set of scanned icon classes.
 *
 * Icons sharing identical markup are grouped into one rule, so a class and its
 * aliases cost a selector rather than a second copy of the artwork. Classes
 * that resolve to no icon are skipped silently, because a scanner reports every
 * prefixed class it sees, including ones that are not icons.
 *
 * A class carrying a stroke modifier, as in `ic-heart/1.5`, renders at that
 * width. One class is one rule: the width is part of the artwork the rule
 * carries, so only the widths the markup actually asked for are generated.
 *
 * @param classes - Scanned class names, stroke modifiers included.
 * @param registry - Registry holding the loaded families.
 * @param options - Class prefix, base rule injection, and default stroke width.
 * @returns The stylesheet and the families it drew from.
 */
export function generateIconSetCss(
  classes: Iterable<string>,
  registry: IconRegistry,
  options?: GenerateIconSetCssOptions,
): IconSetCssResult {
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  const injectBase = options?.injectBase ?? true;
  const prefixDash = `${prefix}-`;

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

  for (const className of classes) {
    if (!className.startsWith(prefixDash)) {
      continue;
    }
    const parsed = parseIconClass(className.slice(prefixDash.length));
    const icon = resolveIconClassName(registry, parsed.name);
    if (!icon) {
      continue;
    }
    usedPrefixes.add(icon.prefix);

    const strokeWidth = parsed.strokeWidth ?? options?.strokeWidth;
    addRule(renderSvg(icon, { strokeWidth }), `.${escapeSelectorClass(className)}`);
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

/**
 * Options for generating the complete stylesheet of one icon family.
 */
export interface GenerateFamilyCssOptions extends BaseCssOptions {
  /**
   * Whether each rule also answers to the unqualified name, so that
   * `ic-lucide-heart` and `ic-heart` share one rule. Defaults to `true`.
   *
   * This is what gives a plugin-free stylesheet a default family: the bare name
   * costs a selector rather than a second copy of the artwork, and the last
   * family a project imports wins it by plain cascade.
   */
  bareNames?: boolean;

  /**
   * Whether to open the stylesheet with the family's license notice as a
   * preserved comment. Defaults to `true`.
   */
  attribution?: boolean;
}

/**
 * Generates the complete stylesheet for one icon family.
 *
 * Every icon is written out, because this is the plugin-free path: nothing is
 * scanning the consumer's markup, so nothing can narrow the family down. A
 * project chooses its cost one family at a time, by choosing which families it
 * imports.
 *
 * Stroke width cannot be varied here. It is baked into the artwork each rule
 * carries, and a stylesheet with no build step behind it has no way to know
 * which widths a project wants, so `ic-heart/1.5` needs one of the plugins.
 *
 * @param family - Family to write out.
 * @param options - Class prefix, bare name selectors, and the license notice.
 * @returns The family stylesheet.
 */
export function generateFamilyCss(family: IconFamilyData, options?: GenerateFamilyCssOptions): string {
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  const bareNames = options?.bareNames ?? true;
  const withAttribution = options?.attribution ?? true;

  const registry = new IconRegistryConstructor();
  registry.registerFamily(family);

  const rules: string[] = [];
  for (const name of [...Object.keys(family.icons), ...Object.keys(family.aliases ?? {})]) {
    const icon = registry.resolve(`${family.prefix}:${name}`);
    if (!icon) {
      continue;
    }
    const selectors = [`.${escapeSelectorClass(`${prefix}-${family.prefix}-${name}`)}`];
    if (bareNames) {
      selectors.push(`.${escapeSelectorClass(`${prefix}-${name}`)}`);
    }
    rules.push(generateIconCss(selectors, renderSvg(icon), { prefix }));
  }

  const banner =
    withAttribution && family.info.attribution !== "none"
      ? `/*!\n * Icon artwork in this stylesheet:\n * ${describeFamilyNotice(family)}\n */\n`
      : "";

  return `${banner}${rules.join("\n\n")}\n`;
}
