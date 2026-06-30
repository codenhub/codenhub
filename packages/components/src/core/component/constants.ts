/**
 * Valid custom element tag name pattern.
 * Must start with a lowercase letter, contain at least one hyphen,
 * and use only lowercase letters, digits, dots, underscores, or hyphens.
 *
 * @internal
 */
export const VALID_TAG_NAME_REGEX = /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/;

/**
 * Reserved SVG/MathML element names that cannot be used as custom element tag
 * names, per the Custom Elements specification.
 *
 * @internal
 */
export const RESERVED_TAG_NAMES = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

/**
 * Property and method names reserved by the component definition shape
 * or built-in HTMLElement APIs.
 *
 * @internal
 */
export const RESERVED_NAMES = new Set([
  "constructor",
  "connectedCallback",
  "disconnectedCallback",
  "attributeChangedCallback",
  "adoptedCallback",
  "tagName",
  "elementClass",
  "create",
  "requestUpdate",
]);

/**
 * Whether the current environment supports the Constructable Stylesheets API.
 * When true, styles are applied via `adoptedStyleSheets` instead of a
 * `<style>` tag fallback.
 *
 * @internal
 */
export const hasConstructableStylesheetsSupport =
  typeof window !== "undefined" &&
  "adoptedStyleSheets" in Document.prototype &&
  "replaceSync" in CSSStyleSheet.prototype;

/**
 * Whether the current environment supports Shadow DOM attachment.
 * Computed once at module load to avoid repeated capability checks per render.
 *
 * @internal
 */
export const hasShadowSupport =
  typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.attachShadow === "function";
