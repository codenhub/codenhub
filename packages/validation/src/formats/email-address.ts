import { HOSTNAME_PATTERN, isPublicHost, toAsciiHost } from "./patterns";

const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;

/**
 * Reads an email address, shared by `email` and the `mailto` addresses of `url`: the local part as
 * written, an `@`, and the domain as the URL parser reads it, or undefined when the text is not an
 * address. The host must be a public domain name, or with `allowLocal` any hostname, such as
 * `localhost` or `intranet`. The local part is ASCII only.
 */
export const toEmailAddress = (text: string, allowPlus: boolean, allowLocal: boolean): string | undefined => {
  const [local, host, extra] = text.split("@");
  const asciiHost = host === undefined ? undefined : toAsciiHost(host);
  const isAddress =
    extra === undefined &&
    local !== undefined &&
    asciiHost !== undefined &&
    // The limit is on the address as it is delivered, where an internationalized host is longer than it is written.
    local.length + 1 + asciiHost.length <= EMAIL_MAX_LENGTH &&
    local.length <= EMAIL_LOCAL_MAX_LENGTH &&
    EMAIL_LOCAL_PATTERN.test(local) &&
    (allowLocal ? HOSTNAME_PATTERN.test(asciiHost) : isPublicHost(asciiHost)) &&
    (allowPlus || !local.includes("+"));
  return isAddress ? `${local}@${asciiHost}` : undefined;
};
