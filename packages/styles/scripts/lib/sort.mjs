/**
 * The order the utilities layer is written in: Tailwind's, so a class that
 * compiles here cascades as it does when a consumer's Tailwind compiles `/tw`.
 *
 * Tailwind does not order utilities by where they are written. It sorts them by
 * the properties their bodies declare: by the first property, in `PROPERTY_ORDER`,
 * where two bodies differ, then the body declaring more first, then by name.
 * A consumer's Tailwind sorts `/tw` that way, so this build sorts the compiled
 * entrypoints the same way, and the same markup cascades the same on both
 * paths. Moving a declaration within a body can therefore move a class in the
 * cascade on both. `tests/integration/adapter.test.ts` holds the two to each other.
 *
 * Transcribed from Tailwind CSS 4.3.4 (`compareCandidates`, `getPropertySort`,
 * `compare`, and the `property-order` list), which is:
 *
 * MIT License
 *
 * Copyright (c) Tailwind Labs, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// prettier-ignore
const PROPERTY_ORDER = [
  "container-type", "pointer-events", "visibility", "position", "inset", "inset-inline", "inset-block",
  "inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end", "top", "right", "bottom",
  "left", "isolation", "z-index", "order", "grid-column", "grid-column-start", "grid-column-end", "grid-row",
  "grid-row-start", "grid-row-end", "float", "clear", "--tw-container-component", "margin", "margin-inline",
  "margin-block", "margin-inline-start", "margin-inline-end", "margin-block-start", "margin-block-end",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "box-sizing", "display", "field-sizing",
  "aspect-ratio", "height", "max-height", "min-height", "width", "max-width", "min-width", "flex",
  "flex-shrink", "flex-grow", "flex-basis", "table-layout", "caption-side", "border-collapse",
  "border-spacing", "transform-origin", "translate", "--tw-translate-x", "--tw-translate-y",
  "--tw-translate-z", "scale", "--tw-scale-x", "--tw-scale-y", "--tw-scale-z", "rotate", "--tw-rotate-x",
  "--tw-rotate-y", "--tw-rotate-z", "--tw-skew-x", "--tw-skew-y", "transform", "zoom", "animation", "cursor",
  "touch-action", "--tw-pan-x", "--tw-pan-y", "--tw-pinch-zoom", "resize", "scroll-snap-type",
  "--tw-scroll-snap-strictness", "scroll-snap-align", "scroll-snap-stop", "scroll-margin",
  "scroll-margin-inline", "scroll-margin-block", "scroll-margin-inline-start", "scroll-margin-inline-end",
  "scroll-margin-block-start", "scroll-margin-block-end", "scroll-margin-top", "scroll-margin-right",
  "scroll-margin-bottom", "scroll-margin-left", "scroll-padding", "scroll-padding-inline",
  "scroll-padding-block", "scroll-padding-inline-start", "scroll-padding-inline-end",
  "scroll-padding-block-start", "scroll-padding-block-end", "scroll-padding-top", "scroll-padding-right",
  "scroll-padding-bottom", "scroll-padding-left", "scrollbar-width", "scrollbar-color", "scrollbar-gutter",
  "list-style-position", "list-style-type", "list-style-image", "appearance", "columns", "break-before",
  "break-inside", "break-after", "grid-auto-columns", "grid-auto-flow", "grid-auto-rows",
  "grid-template-columns", "grid-template-rows", "flex-direction", "flex-wrap", "place-content",
  "place-items", "align-content", "align-items", "justify-content", "justify-items", "gap", "column-gap",
  "row-gap", "--tw-space-x-reverse", "--tw-space-y-reverse", "divide-x-width", "divide-y-width",
  "--tw-divide-y-reverse", "divide-style", "divide-color", "place-self", "align-self", "justify-self",
  "overflow", "overflow-x", "overflow-y", "overscroll-behavior", "overscroll-behavior-x",
  "overscroll-behavior-y", "scroll-behavior", "border-radius", "border-start-radius", "border-end-radius",
  "border-top-radius", "border-right-radius", "border-bottom-radius", "border-left-radius",
  "border-start-start-radius", "border-start-end-radius", "border-end-end-radius", "border-end-start-radius",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius",
  "border-bottom-left-radius", "border-width", "border-inline-width", "border-block-width",
  "border-inline-start-width", "border-inline-end-width", "border-block-start-width",
  "border-block-end-width", "border-top-width", "border-right-width", "border-bottom-width",
  "border-left-width", "border-style", "border-inline-style", "border-block-style",
  "border-inline-start-style", "border-inline-end-style", "border-block-start-style",
  "border-block-end-style", "border-top-style", "border-right-style", "border-bottom-style",
  "border-left-style", "border-color", "border-inline-color", "border-block-color",
  "border-inline-start-color", "border-inline-end-color", "border-block-start-color",
  "border-block-end-color", "border-top-color", "border-right-color", "border-bottom-color",
  "border-left-color", "background-color", "background-image", "--tw-gradient-position",
  "--tw-gradient-stops", "--tw-gradient-via-stops", "--tw-gradient-from", "--tw-gradient-from-position",
  "--tw-gradient-via", "--tw-gradient-via-position", "--tw-gradient-to", "--tw-gradient-to-position",
  "mask-image", "--tw-mask-top", "--tw-mask-top-from-color", "--tw-mask-top-from-position",
  "--tw-mask-top-to-color", "--tw-mask-top-to-position", "--tw-mask-right", "--tw-mask-right-from-color",
  "--tw-mask-right-from-position", "--tw-mask-right-to-color", "--tw-mask-right-to-position",
  "--tw-mask-bottom", "--tw-mask-bottom-from-color", "--tw-mask-bottom-from-position",
  "--tw-mask-bottom-to-color", "--tw-mask-bottom-to-position", "--tw-mask-left", "--tw-mask-left-from-color",
  "--tw-mask-left-from-position", "--tw-mask-left-to-color", "--tw-mask-left-to-position",
  "--tw-mask-linear", "--tw-mask-linear-position", "--tw-mask-linear-from-color",
  "--tw-mask-linear-from-position", "--tw-mask-linear-to-color", "--tw-mask-linear-to-position",
  "--tw-mask-radial", "--tw-mask-radial-shape", "--tw-mask-radial-size", "--tw-mask-radial-position",
  "--tw-mask-radial-from-color", "--tw-mask-radial-from-position", "--tw-mask-radial-to-color",
  "--tw-mask-radial-to-position", "--tw-mask-conic", "--tw-mask-conic-position",
  "--tw-mask-conic-from-color", "--tw-mask-conic-from-position", "--tw-mask-conic-to-color",
  "--tw-mask-conic-to-position", "box-decoration-break", "background-size", "background-attachment",
  "background-clip", "background-position", "background-repeat", "background-origin", "mask-composite",
  "mask-mode", "mask-type", "mask-size", "mask-clip", "mask-position", "mask-repeat", "mask-origin", "fill",
  "stroke", "stroke-width", "object-fit", "object-position", "padding", "padding-inline", "padding-block",
  "padding-inline-start", "padding-inline-end", "padding-block-start", "padding-block-end", "padding-top",
  "padding-right", "padding-bottom", "padding-left", "text-align", "text-indent", "vertical-align",
  "font-family", "font-feature-settings", "font-size", "line-height", "font-weight", "letter-spacing",
  "text-wrap", "overflow-wrap", "word-break", "text-overflow", "hyphens", "white-space", "tab-size", "color",
  "text-transform", "font-style", "font-stretch", "font-variant-numeric", "text-decoration-line",
  "text-decoration-color", "text-decoration-style", "text-decoration-thickness", "text-underline-offset",
  "-webkit-font-smoothing", "placeholder-color", "caret-color", "accent-color", "color-scheme", "opacity",
  "background-blend-mode", "mix-blend-mode", "box-shadow", "--tw-shadow", "--tw-shadow-color",
  "--tw-ring-shadow", "--tw-ring-color", "--tw-inset-shadow", "--tw-inset-shadow-color",
  "--tw-inset-ring-shadow", "--tw-inset-ring-color", "--tw-ring-offset-width", "--tw-ring-offset-color",
  "outline", "outline-width", "outline-offset", "outline-color", "--tw-blur", "--tw-brightness",
  "--tw-contrast", "--tw-drop-shadow", "--tw-grayscale", "--tw-hue-rotate", "--tw-invert", "--tw-saturate",
  "--tw-sepia", "filter", "--tw-backdrop-blur", "--tw-backdrop-brightness", "--tw-backdrop-contrast",
  "--tw-backdrop-grayscale", "--tw-backdrop-hue-rotate", "--tw-backdrop-invert", "--tw-backdrop-opacity",
  "--tw-backdrop-saturate", "--tw-backdrop-sepia", "backdrop-filter", "transition-property",
  "transition-behavior", "transition-delay", "transition-duration", "transition-timing-function",
  "will-change", "contain", "content", "forced-color-adjust",
];

/**
 * The sort key of a body, a list of PostCSS nodes: the positions in
 * `PROPERTY_ORDER` of the properties it declares, nested rules included, and
 * how many declarations it holds.
 */
export function propertySort(nodes) {
  const order = new Set();
  let count = 0;
  let sorted = false;
  const queue = [...nodes];

  while (queue.length > 0) {
    const node = queue.shift();

    if (node.type === "decl") {
      count += 1;

      if (sorted) {
        continue;
      }

      if (node.prop === "--tw-sort") {
        const index = PROPERTY_ORDER.indexOf(node.value);

        if (index !== -1) {
          order.add(index);
          sorted = true;
          continue;
        }
      }

      const index = PROPERTY_ORDER.indexOf(node.prop);

      if (index !== -1) {
        order.add(index);
      }
    } else if (node.type === "rule" || node.type === "atrule") {
      queue.push(...(node.nodes ?? []));
    }
  }

  return { order: [...order].sort((a, b) => a - b), count };
}

/** Tailwind's name order: a run of digits compares as a number. */
export function compareNames(a, b) {
  const length = Math.min(a.length, b.length);

  for (let i = 0; i < length; i++) {
    let x = a.charCodeAt(i);
    let y = b.charCodeAt(i);

    if (x >= 48 && x <= 57 && y >= 48 && y <= 57) {
      let endA = i + 1;
      let endB = i + 1;

      for (x = a.charCodeAt(endA); x >= 48 && x <= 57; x = a.charCodeAt(++endA)) {
        // The digits run on.
      }
      for (y = b.charCodeAt(endB); y >= 48 && y <= 57; y = b.charCodeAt(++endB)) {
        // The digits run on.
      }

      const digitsA = a.slice(i, endA);
      const digitsB = b.slice(i, endB);
      const difference = Number(digitsA) - Number(digitsB);

      if (difference) {
        return difference;
      }

      if (digitsA !== digitsB) {
        return digitsA < digitsB ? -1 : 1;
      }

      continue;
    }

    if (x !== y) {
      return x - y;
    }
  }

  return a.length - b.length;
}

/**
 * Compares two entries `{ variants, properties, name }`: `variants` is a
 * bigint with one bit per variant, in variant order, so a class with no variant
 * comes first; `properties` is a `propertySort` result.
 */
export function compareUtilities(a, b) {
  if (a.variants !== b.variants) {
    return a.variants < b.variants ? -1 : 1;
  }

  let offset = 0;

  while (
    offset < a.properties.order.length &&
    offset < b.properties.order.length &&
    a.properties.order[offset] === b.properties.order[offset]
  ) {
    offset += 1;
  }

  return (
    (a.properties.order[offset] ?? Infinity) - (b.properties.order[offset] ?? Infinity) ||
    b.properties.count - a.properties.count ||
    compareNames(a.name, b.name)
  );
}
