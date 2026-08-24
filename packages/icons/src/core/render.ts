import type { ResolvedIcon } from "./types.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
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
 * The element carries only a namespace and a viewBox, leaving size and color to
 * CSS. The viewBox keeps the icon's own origin, because families such as
 * Material Symbols draw above it. A stroke width is applied only when the
 * icon's family is stroke-based.
 *
 * @param icon - Icon to render.
 * @param options - Stroke width and extra element attributes.
 * @returns SVG markup.
 */
export function renderSvg(icon: ResolvedIcon, options?: RenderSvgOptions): string {
  const body =
    icon.strokeWidth !== undefined && options?.strokeWidth !== undefined
      ? setStrokeWidth(icon.body, options.strokeWidth)
      : icon.body;
  const extra = options?.attributes ? renderAttributes(options.attributes) : "";

  return `<svg xmlns="${SVG_NAMESPACE}" viewBox="${icon.left} ${icon.top} ${icon.width} ${icon.height}"${extra}>${body}</svg>`;
}
