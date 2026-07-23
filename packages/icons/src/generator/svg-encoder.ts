/**
 * Converts a raw SVG string into an optimized UTF-8 data URI suitable for CSS `mask-image` or `background-image`.
 *
 * @param svg - The raw SVG string to encode.
 * @returns The formatted UTF-8 data URI string.
 */
export function svgToDataUri(svg: string): string {
  let cleaned = svg.trim();

  if (!cleaned.includes("xmlns=")) {
    cleaned = cleaned.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // Replace double quotes with single quotes for XML attribute safety
  cleaned = cleaned.replace(/"/g, "'");

  // Encode characters that interfere with CSS url() or URL parsing and collapse whitespace
  const encoded = cleaned
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\s+/g, " ");

  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}
