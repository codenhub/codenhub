/**
 * Class representing a trusted, serialized HTML template.
 * Returned by the `html` helper.
 */
export class TemplateResult {
  /**
   * @param value - The raw, trusted HTML template string.
   */
  constructor(
    /** The raw, serialized HTML content. */
    public readonly value: string,
  ) {}

  /**
   * Returns the raw HTML string representation.
   *
   * @returns Raw template string.
   */
  toString(): string {
    return this.value;
  }
}

/**
 * Escapes special HTML characters to prevent XSS.
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tagged template literal helper for HTML markup.
 *
 * Performs HTML escaping on standard string interpolations to prevent XSS.
 * To insert raw HTML, wrap the value in `unsafeHTML`.
 *
 * @param strings - Static template string fragments.
 * @param values - Dynamic values to interpolate and concatenate.
 * @returns A `TemplateResult` containing the escaped and concatenated HTML.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult {
  const result = strings.reduce((res, str, i) => {
    const val = values[i];
    let serialized = "";
    if (val !== undefined && val !== null) {
      if (val instanceof TemplateResult) {
        serialized = val.value;
      } else if (Array.isArray(val)) {
        serialized = val
          .map((item) => (item instanceof TemplateResult ? item.value : escapeHTML(serializeValue(item))))
          .join("");
      } else {
        serialized = escapeHTML(serializeValue(val));
      }
    }
    return res + str + serialized;
  }, "");
  return new TemplateResult(result);
}

function serializeValue(val: unknown): string {
  if (val === undefined || val === null) {
    return "";
  }
  if (typeof val === "object") {
    if (typeof val.toString === "function" && val.toString !== Object.prototype.toString) {
      return val.toString();
    }
    return JSON.stringify(val);
  }
  return String(val);
}

/**
 * Wraps a value to bypass automatic HTML escaping in the `html` helper.
 *
 * > [!WARNING]
 * > Only use this helper with trusted inputs to prevent XSS attacks.
 *
 * @param value - Trusted HTML string or value to insert raw.
 * @returns A `TemplateResult` bypassing automatic HTML escaping.
 */
export function unsafeHTML(value: unknown): TemplateResult {
  return new TemplateResult(value === null || value === undefined ? "" : String(value));
}

/**
 * Tagged template literal helper for CSS styling.
 *
 * Enables editor syntax highlighting and type safety for CSS strings.
 * Returns the processed CSS string with interpolated values inlined.
 *
 * @param strings - Static template string fragments.
 * @param values - Dynamic values to interpolate and concatenate.
 * @returns Concatenated CSS stylesheet string.
 * @throws {TypeError} If an array or a plain object (without a custom `toString` method) is interpolated.
 *
 * @example
 * ```ts
 * const styles = css`
 *   .card { border: 1px solid #ccc; padding: 16px; }
 * `;
 * ```
 */
export function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((result, str, i) => {
    const val = values[i];
    let serialized = "";
    if (val !== undefined && val !== null) {
      if (typeof val === "object") {
        if (Array.isArray(val)) {
          throw new TypeError("Invalid CSS interpolation: arrays are not allowed in css helper.");
        }
        if (typeof val.toString === "function" && val.toString !== Object.prototype.toString) {
          serialized = val.toString();
        } else {
          throw new TypeError("Invalid CSS interpolation: plain objects are not allowed in css helper.");
        }
      } else {
        serialized = String(val);
      }
    }
    return result + str + serialized;
  }, "");
}
