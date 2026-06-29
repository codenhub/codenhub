/**
 * Tagged template literal helper for HTML markup.
 *
 * Performs simple string concatenation. Objects are serialized with
 * `JSON.stringify` (unless they provide a custom `toString` method);
 * arrays are serialized by mapping each item through the same rules and joining them.
 * All other values use `String()`. `null` and `undefined` interpolations
 * produce an empty string.
 *
 * > [!WARNING]
 * > This helper does NOT perform HTML escaping or sanitization.
 * > To prevent Cross-Site Scripting (XSS) attacks, ensure any user-controlled
 * > input interpolated here is sanitized first.
 *
 * @param strings - Static template string fragments.
 * @param values - Dynamic values to interpolate and concatenate.
 * @returns Concatenated HTML markup string.
 *
 * @example
 * ```ts
 * const markup = html`<h1>${title}</h1>`;
 * ```
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((result, str, i) => {
    const val = values[i];
    let serialized = "";
    if (val !== undefined && val !== null) {
      if (Array.isArray(val)) {
        serialized = val.map(serializeValue).join("");
      } else {
        serialized = serializeValue(val);
      }
    }
    return result + str + serialized;
  }, "");
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
 * Tagged template literal helper for CSS styling.
 *
 * Enables editor syntax highlighting and type safety for CSS strings.
 * Returns the processed CSS string with interpolated values inlined.
 *
 * @param strings - Static template string fragments.
 * @param values - Dynamic values to interpolate and concatenate.
 * @returns Concatenated CSS stylesheet string.
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
