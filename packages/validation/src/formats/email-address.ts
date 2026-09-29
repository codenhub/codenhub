import { HOSTNAME_PATTERN, isPublicHost } from "./patterns";

const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;

/**
 * Tests an email address, shared by `email` and the `mailto` addresses of `url`. The host must be a
 * public domain name, or with `allowLocal` any hostname, such as `localhost` or `intranet`.
 */
export const isEmailAddress = (text: string, allowPlus: boolean, allowLocal: boolean): boolean => {
  const [local, host, extra] = text.split("@");
  return (
    extra === undefined &&
    local !== undefined &&
    host !== undefined &&
    text.length <= EMAIL_MAX_LENGTH &&
    local.length <= EMAIL_LOCAL_MAX_LENGTH &&
    EMAIL_LOCAL_PATTERN.test(local) &&
    (allowLocal ? HOSTNAME_PATTERN.test(host) : isPublicHost(host)) &&
    (allowPlus || !local.includes("+"))
  );
};
