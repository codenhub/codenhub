import { toEmailAddress } from "./email-address";

/**
 * The schemes whose URLs name no host, each read by its own rules below. A URL of one of them is read
 * by those rules even when it is written with a host, as in `mailto://example.com`, which names no
 * recipient.
 */
export const HOSTLESS_SCHEMES = ["mailto", "tel", "urn"];

/**
 * A global number from RFC 3966: `+`, digits with the visual separators `-`, `.`, `(` and `)`
 * between them, then `;name=value` parameters whose value holds only the characters the RFC lists
 * and escapes. Every repetition ends on a digit or starts with `;`, so matching stays linear.
 */
const TEL_PATTERN = /^\+[0-9](?:[-.()]*[0-9])*(?:;[a-z0-9-]+(?:=(?:[\w.!~*'()[\]/:&+$-]|%[0-9a-f]{2})+)?)*$/i;

/**
 * An RFC 8141 name after `urn:`: a namespace of 2 to 32 letters, digits and inner hyphens, a colon,
 * a non-empty specific string, then the optional `?+`, `?=` and `#` components. A `%` must start an
 * escape, and the escape and the plain characters never overlap, so matching stays linear.
 */
const URN_PATTERN =
  /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]:(?:[\w\-.~!$&'()*+,;=:@]|%[0-9a-f]{2})(?:[\w\-.~!$&'()*+,;=:@/]|%[0-9a-f]{2})*(?:\?\+[^?#]*)?(?:\?=[^#]*)?(?:#.*)?$/i;

/** The header fields RFC 6068 gives a message. Any other, such as `from`, fails. */
const FIELD_PATTERN = /^(?:to|cc|bcc|subject|body)$/;
/** The fields that hold recipients, which must pass as addresses too. */
const RECIPIENT_FIELD_PATTERN = /^(?:to|cc|bcc)$/;
/**
 * The text of a `subject` or `body`: what RFC 6068 allows, letters, digits, `- . _ ~`, the delimiters
 * `! $ ' ( ) * + , ; : @` and escapes, which is how a line break or any other character is written, and
 * also `/` and `?`, which a URL query allows and links often hold unescaped, as in a body that is a link.
 * `&`, `=` and `#` stay escaped, since they would end the field, start another or end the query.
 */
const TEXT_VALUE_PATTERN = /^(?:[\w.~!$'()*+,;:@/?-]|%[0-9a-f]{2})*$/i;
/**
 * Characters of an address that a mailto URL must escape (RFC 6068): all but letters, digits, `@` and
 * `_ . ~ ! $ ' * + -`. Only a local part holds any, such as `?`, `&`, `#` or `%`, which would end the
 * address or start an escape.
 */
const MAILTO_ESCAPED_PATTERN = /[^\w.~!$'*+@-]/g;

/**
 * Reads the part of a mailto URL after the colon, returning it with every recipient as `email` returns
 * it and every field name in lowercase, or undefined when it is not a mailto. Every field of the query
 * must be `name=value` with a name from an allowlist: `to`, `cc` and `bcc`, whose recipients must pass
 * as addresses like those in the path, and `subject` and `body`, whose text must be written as RFC
 * 6068 allows and is kept as written, encoded line breaks included.
 */
function toMailto(rest: string, allowLocal: boolean): string | undefined {
  const queryStart = rest.indexOf("?");
  const path = queryStart === -1 ? rest : rest.slice(0, queryStart);
  let count = 0;
  let isMailto = true;
  // Each list is read with `map`, never spread into a call, which a long list would overflow.
  const toRecipients = (list: string): string =>
    list
      .split(",")
      .map((encoded) => {
        const address = toEmailAddress(decodeURIComponent(encoded), true, allowLocal);
        count += 1;
        isMailto &&= address !== undefined;
        return address?.replace(MAILTO_ESCAPED_PATTERN, (character) => encodeURIComponent(character));
      })
      .join(",");
  const toField = (field: string): string => {
    const separator = field.indexOf("=");
    const name = field.slice(0, separator).toLowerCase();
    const value = field.slice(separator + 1);
    isMailto &&= separator !== -1 && FIELD_PATTERN.test(name);
    if (!RECIPIENT_FIELD_PATTERN.test(name)) {
      isMailto &&= TEXT_VALUE_PATTERN.test(value);
      return `${name}=${value}`;
    }
    return `${name}=${isMailto ? toRecipients(value) : value}`;
  };
  try {
    const recipients = path === "" ? "" : toRecipients(path);
    const value =
      queryStart === -1
        ? recipients
        : `${recipients}?${rest
            .slice(queryStart + 1)
            .split("&")
            .map(toField)
            .join("&")}`;
    return isMailto && count > 0 ? value : undefined;
  } catch {
    // decodeURIComponent throws on a malformed escape, which makes the URL invalid.
    return undefined;
  }
}

/**
 * Reads a URL that has no host from the part after its scheme's colon, returning that part as the value
 * holds it, or undefined when it breaks its scheme's rules. Each scheme has its own rules, and a scheme
 * without rules here fails, so a listed protocol is never accepted unchecked.
 */
export function toHostlessUrl(scheme: string, rest: string, allowLocal: boolean): string | undefined {
  switch (scheme) {
    case "mailto":
      return toMailto(rest, allowLocal);
    case "tel":
      return TEL_PATTERN.test(rest) ? rest : undefined;
    case "urn":
      return URN_PATTERN.test(rest) ? rest : undefined;
    default:
      return undefined;
  }
}
