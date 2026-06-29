/**
 * Tagged template literal helper for HTML markup.
 *
 * Performs simple string concatenation. Objects are serialized with
 * `JSON.stringify`; all other values use `String()`. `null` and
 * `undefined` interpolations produce an empty string.
 *
 * > [!WARNING]
 * > This helper does NOT perform HTML escaping or sanitization.
 * > To prevent Cross-Site Scripting (XSS) attacks, ensure any user-controlled
 * > input interpolated here is sanitized first.
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
        serialized = val.map((v) => (v !== undefined && v !== null ? String(v) : "")).join("");
      } else if (typeof val === "object") {
        serialized = JSON.stringify(val);
      } else {
        serialized = String(val);
      }
    }
    return result + str + serialized;
  }, "");
}

/**
 * Tagged template literal helper for CSS styling.
 *
 * Enables editor syntax highlighting and type safety for CSS strings.
 * Returns the processed CSS string with interpolated values inlined.
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
    const serialized = val !== undefined && val !== null ? String(val) : "";
    return result + str + serialized;
  }, "");
}
