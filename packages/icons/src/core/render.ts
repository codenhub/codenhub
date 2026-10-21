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

const OPENING_OR_CLOSING_TAG = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
const PAINT_ATTRIBUTE = /(?<=\s)(fill|stroke)="([^"]*)"/g;
const STYLE_ATTRIBUTE = /(?<=\s)style="([^"]*)"/;
// Content that paints into a mask, a clip, or a filter result rather than onto
// the page; recoloring it would change what the logo shows, not its color.
const UNPAINTED_CONTAINERS = new Set(["clipPath", "filter", "mask", "pattern"]);
const DEFAULT_FILL = "#000";

function overridePaintAttributes(attributes: string, prefix: string): string {
  const declarations = [...attributes.matchAll(PAINT_ATTRIBUTE)]
    .filter(([, , value]) => value !== "none")
    .map(([, property, value]) => `${property}: var(--${prefix}-color, ${value})`);
  if (declarations.length === 0) {
    return attributes;
  }
  const existing = STYLE_ATTRIBUTE.exec(attributes);
  if (!existing) {
    const written = attributes.trimEnd();
    return `${written} style="${declarations.join("; ")}"${attributes.slice(written.length)}`;
  }
  const merged = [existing[1].trim().replace(/;$/, ""), ...declarations].filter(Boolean).join("; ");
  return attributes.replace(STYLE_ATTRIBUTE, `style="${merged}"`);
}

/**
 * Lets `--<prefix>-color` repaint full-color artwork as a silhouette.
 *
 * A presentation attribute cannot read a custom property, so each `fill` and
 * `stroke` gains a `style` declaration that falls back to its own value. The
 * attribute stays: a Content Security Policy that blocks style attributes drops
 * the declarations and the logo keeps its colors. The body is wrapped in a `<g>`
 * that does the same for SVG's default black fill, which the `<svg>` element's
 * `fill="currentColor"` would otherwise replace with the text color.
 */
function overridePaint(body: string, prefix: string): string {
  let unpaintedDepth = 0;
  const rewritten = body.replace(
    OPENING_OR_CLOSING_TAG,
    (tag, closing: string, name: string, attributes: string, selfClosing: string) => {
      if (UNPAINTED_CONTAINERS.has(name)) {
        if (closing) {
          unpaintedDepth -= 1;
        } else if (!selfClosing) {
          unpaintedDepth += 1;
        }
        return tag;
      }
      if (closing || unpaintedDepth > 0) {
        return tag;
      }
      return `<${name}${overridePaintAttributes(attributes, prefix)}${selfClosing}>`;
    },
  );
  return `<g fill="${DEFAULT_FILL}" style="fill: var(--${prefix}-color, ${DEFAULT_FILL})">${rewritten}</g>`;
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
 * `style` attribute a caller or the markup puts on the element. The `<g>` also
 * carries the color as a presentation attribute: a Content Security Policy that
 * blocks style attributes drops the `style`, and the icon keeps its own color,
 * though `--ic-color` no longer reaches it.
 *
 * A multicolor icon keeps the colors its artwork is drawn in, and `--ic-color`
 * repaints every fill and stroke as a one-color silhouette. Each painted element
 * carries its own `style` declaration for this, beside the attribute it falls
 * back to, so the same Content Security Policy leaves the logo in full color.
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
  const painted = icon.multicolor ? overridePaint(stroked, escapeAttributeValue(prefix)) : stroked;
  const body =
    icon.color === undefined
      ? painted
      : `<g color="${escapeAttributeValue(icon.color)}" style="color: var(--${escapeAttributeValue(prefix)}-color, ${escapeAttributeValue(icon.color)})">${painted}</g>`;
  const extra = renderAttributes({ width: "1em", height: "1em", fill: "currentColor", ...options?.attributes });

  return `<svg xmlns="${SVG_NAMESPACE}" viewBox="${icon.left} ${icon.top} ${icon.width} ${icon.height}"${extra}>${body}</svg>`;
}
