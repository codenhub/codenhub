import { isEmailAddress } from "./email-address";

/**
 * A global number from RFC 3966: `+`, digits with the visual separators `-`, `.`, `(` and `)`
 * between them, then `;name=value` parameters. Every repetition ends on a digit or starts with `;`,
 * so matching stays linear.
 */
const TEL_PATTERN = /^\+[0-9](?:[-.()]*[0-9])*(?:;[a-z0-9-]+(?:=[^;]+)?)*$/i;

/**
 * An RFC 8141 name after `urn:`: a namespace of 2 to 32 letters, digits and inner hyphens, a colon,
 * a non-empty specific string, then the optional `?+`, `?=` and `#` components. A `%` must start an
 * escape, and the escape and the plain characters never overlap, so matching stays linear.
 */
const URN_PATTERN =
  /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]:(?:[\w\-.~!$&'()*+,;=:@]|%[0-9a-f]{2})(?:[\w\-.~!$&'()*+,;=:@/]|%[0-9a-f]{2})*(?:\?\+[^?#]*)?(?:\?=[^#]*)?(?:#.*)?$/i;

/** The header fields of a mailto URL that hold recipients, which must pass as addresses too. */
const RECIPIENT_FIELD_PATTERN = /^(?:to|cc|bcc)$/i;

/** Tests the part of a mailto URL after the colon: every recipient, in the path or the query. */
function isMailto(rest: string, allowLocal: boolean): boolean {
  const queryStart = rest.indexOf("?");
  const path = queryStart === -1 ? rest : rest.slice(0, queryStart);
  const encoded = path === "" ? [] : path.split(",");
  if (queryStart !== -1) {
    for (const field of rest.slice(queryStart + 1).split("&")) {
      const separator = field.indexOf("=");
      if (separator !== -1 && RECIPIENT_FIELD_PATTERN.test(field.slice(0, separator))) {
        encoded.push(...field.slice(separator + 1).split(","));
      }
    }
  }
  try {
    return (
      encoded.length > 0 && encoded.every((address) => isEmailAddress(decodeURIComponent(address), true, allowLocal))
    );
  } catch {
    // decodeURIComponent throws on a malformed escape, which makes the URL invalid.
    return false;
  }
}

/**
 * Tests a URL that has no host, from the part after its scheme's colon. Each scheme has its own
 * rules, and a scheme without rules here fails, so a listed protocol is never accepted unchecked.
 */
export function isHostlessUrl(scheme: string, rest: string, allowLocal: boolean): boolean {
  switch (scheme) {
    case "mailto":
      return isMailto(rest, allowLocal);
    case "tel":
      return TEL_PATTERN.test(rest);
    case "urn":
      return URN_PATTERN.test(rest);
    default:
      return false;
  }
}
