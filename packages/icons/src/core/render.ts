import type { ResolvedIcon } from "./types.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEFAULT_PREFIX = "ic";
const STROKE_WIDTH_ATTRIBUTE = /stroke-width="[^"]*"/g;
const VALID_ATTRIBUTE_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;

function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Options for rendering a resolved icon into an SVG element.
 */
export interface RenderSvgOptions {
  /**
   * Stroke width to apply. Ignored for families that are not stroke-based.
   */
  strokeWidth?: number | string;

  /**
   * Extra attributes to place on the `<svg>` element, such as `aria-hidden`.
   */
  attributes?: Record<string, string>;

  /**
   * Class prefix whose `--<prefix>-color` property overrides an icon's own
   * color. Defaults to `"ic"`.
   */
  prefix?: string;
}

function isSafeAttributeName(name: string): boolean {
  return VALID_ATTRIBUTE_NAME.test(name) && !/^on/i.test(name);
}

function renderAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .filter(([name]) => isSafeAttributeName(name))
    .map(([name, value]) => ` ${name}="${escapeAttributeValue(value)}"`)
    .join("");
}

/**
 * Replaces every `stroke-width` in icon markup.
 *
 * Icon bodies carry their presentation attributes, so a family authored at
 * stroke width 2 is restyled by rewriting them rather than by adding an
 * attribute the inner markup would override.
 *
 * @param body - Inner SVG markup of an icon.
 * @param strokeWidth - Stroke width to apply.
 * @returns The markup with its stroke widths replaced, unchanged when it
 * declares none.
 */
export function setStrokeWidth(body: string, strokeWidth: number | string): string {
  const value = escapeAttributeValue(String(strokeWidth));
  return body.replace(STROKE_WIDTH_ATTRIBUTE, `stroke-width="${value}"`);
}

/**
 * Renders a resolved icon as a complete, self-contained SVG element.
 *
 * The element carries a namespace, a viewBox, a `1em` box, and
 * `fill="currentColor"`, leaving color to CSS. The fill is for bodies that set
 * none of their own, such as Material Symbols and Simple Icons paths, which SVG
 * would otherwise paint black whatever `color` says; a body that sets its own
 * fill, as Lucide's `fill="none"` does, still wins. The `1em` box is a floor for an
 * icon inlined with no stylesheet behind it, which a bare `viewBox` renders at
 * 0×0. It is a presentation attribute, so CSS `width`/`height` still wins —
 * including the base stylesheet's `svg[class^="ic-"]` rule, which reads
 * `--ic-size` and `--ic-color` and so carries the `ic-xs`–`ic-xl` size axis and
 * the colour custom property onto an inlined icon the same as onto an `<i>`.
 * Passing `width`, `height`, or `fill` in {@link RenderSvgOptions.attributes}
 * replaces the default. The viewBox keeps the icon's own origin, because families such as
 * Material Symbols draw above it. A stroke width is applied only when the icon's
 * family is stroke-based.
 *
 * An icon with a color of its own, such as a brand mark, is painted in it unless
 * `--ic-color` is set on the element or an ancestor. The color sits on a `<g>`
 * around the body rather than on the `<svg>`, so it never collides with a
 * `style` attribute a caller or the markup puts on the element.
 *
 * @param icon - Icon to render.
 * @param options - Stroke width, extra element attributes, and class prefix.
 * @returns SVG markup.
 */
export function renderSvg(icon: ResolvedIcon, options?: RenderSvgOptions): string {
  const stroked =
    icon.strokeWidth !== undefined && options?.strokeWidth !== undefined
      ? setStrokeWidth(icon.body, options.strokeWidth)
      : icon.body;
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  const body =
    icon.color === undefined
      ? stroked
      : `<g style="color: var(--${escapeAttributeValue(prefix)}-color, ${escapeAttributeValue(icon.color)})">${stroked}</g>`;
  const extra = renderAttributes({ width: "1em", height: "1em", fill: "currentColor", ...options?.attributes });

  return `<svg xmlns="${SVG_NAMESPACE}" viewBox="${icon.left} ${icon.top} ${icon.width} ${icon.height}"${extra}>${body}</svg>`;
}
