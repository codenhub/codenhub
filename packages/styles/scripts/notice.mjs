/**
 * The licence notice a compiled stylesheet carries for the third-party art it
 * holds. The checkbox marks are inline SVG derived from Lucide's `check` and
 * `minus`, whose ISC licence asks that its notice travel with every copy, and
 * a consumer who serves a compiled file ships a copy without `NOTICE`. A `/*!`
 * comment survives minifiers, and `chs build` keeps comments between rules.
 */

/** Present in a stylesheet that carries the check mark. */
const MARK = "20 6 9 17 4 12";

const NOTICE =
  "/*! @codenhub/styles | Apache-2.0 | The checkbox marks are derived from the Lucide check and minus icons (ISC), which derive from Feather (MIT); see NOTICE in the package */";

/** Returns `code` with the notice after its leading banner comment, when it carries the marks. */
export function withNotice(code) {
  if (!code.includes(MARK)) {
    return code;
  }

  // Tailwind's own banner stays first; the notice goes on the line after it.
  const end = code.startsWith("/*!") ? code.indexOf("*/") + 2 : 0;

  return end ? `${code.slice(0, end)}\n${NOTICE}${code.slice(end)}` : `${NOTICE}\n${code}`;
}
