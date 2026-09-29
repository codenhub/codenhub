import { HOSTNAME_PATTERN, isPublicHost, toAsciiHost } from "./patterns";

const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;

/**
 * Tests an email address, shared by `email` and the `mailto` addresses of `url`. The host must be a
 * public domain name, or with `allowLocal` any hostname, such as `localhost` or `intranet`. An
 * internationalized host is checked in its ASCII form; the local part is ASCII only.
 */
export const isEmailAddress = (text: string, allowPlus: boolean, allowLocal: boolean): boolean => {
  const [local, host, extra] = text.split("@");
  const asciiHost = host === undefined ? undefined : toAsciiHost(host);
  return (
    extra === undefined &&
    local !== undefined &&
    asciiHost !== undefined &&
    // The limit is on the address as it is delivered, where an internationalized host is longer than it is written.
    local.length + 1 + asciiHost.length <= EMAIL_MAX_LENGTH &&
    local.length <= EMAIL_LOCAL_MAX_LENGTH &&
    EMAIL_LOCAL_PATTERN.test(local) &&
    (allowLocal ? HOSTNAME_PATTERN.test(asciiHost) : isPublicHost(asciiHost)) &&
    (allowPlus || !local.includes("+"))
  );
};
