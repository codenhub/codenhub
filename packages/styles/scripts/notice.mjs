/**
 * The licence notice a compiled stylesheet carries for the third-party art it
 * holds. The checkbox marks are inline SVG derived from Lucide's `check` and
 * `minus`, which derive from Feather. Lucide's ISC licence and Feather's MIT
 * licence each ask that their copyright and permission notices appear in every
 * copy, and a consumer who serves a compiled file ships a copy without
 * `NOTICE`, so the comment carries those notices in full, read from `NOTICE`
 * so the two cannot drift. A `/*!` comment survives minifiers, and
 * `chs build` keeps comments between rules.
 */

import { readFileSync } from "node:fs";

/** Present in a stylesheet that carries the check mark. */
const MARK = "20 6 9 17 4 12";

/** Where the third-party part of `NOTICE` begins. */
const THIRD_PARTY = "This product contains SVG icon assets derived from Lucide";

const noticeFile = readFileSync(new URL("../NOTICE", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const thirdParty = noticeFile.slice(noticeFile.indexOf(THIRD_PARTY)).trim();

if (!noticeFile.includes(THIRD_PARTY) || thirdParty.includes("*/")) {
  throw new Error("NOTICE no longer holds the third-party notices notice.mjs embeds");
}

const NOTICE = `/*! @codenhub/styles | Apache-2.0 | The checkbox marks are derived from the Lucide check and minus icons (ISC), which derive from Feather (MIT).\n\n${thirdParty}\n*/`;

/** Returns `code` with the notice after its leading banner comment, when it carries the marks. */
export function withNotice(code) {
  if (!code.includes(MARK)) {
    return code;
  }

  // Tailwind's own banner stays first; the notice goes on the line after it.
  const end = code.startsWith("/*!") ? code.indexOf("*/") + 2 : 0;

  return end ? `${code.slice(0, end)}\n${NOTICE}${code.slice(end)}` : `${NOTICE}\n${code}`;
}
