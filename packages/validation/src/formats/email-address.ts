import { isHostname, isPlainHostname, isPlainPublicHost, isPublicHost, toAsciiHost, toPlainHost } from "./patterns";

const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;

/**
 * Reads an email address: the local part as written, an `@`, and the domain as `toHost` reads it, or
 * undefined when the text is not an address or `isHost` refuses the domain. The local part is ASCII only.
 */
const addressOf = (
  text: string,
  allowPlus: boolean,
  toHost: (host: string) => string | undefined,
  isHost: (host: string) => boolean,
): string | undefined => {
  const [local, host, extra] = text.split("@");
  const asciiHost = host === undefined ? undefined : toHost(host);
  const isAddress =
    extra === undefined &&
    local !== undefined &&
    asciiHost !== undefined &&
    // The limit is on the address as it is delivered, where an internationalized host is longer than it is written.
    local.length + 1 + asciiHost.length <= EMAIL_MAX_LENGTH &&
    local.length <= EMAIL_LOCAL_MAX_LENGTH &&
    EMAIL_LOCAL_PATTERN.test(local) &&
    isHost(asciiHost) &&
    (allowPlus || !local.includes("+"));
  return isAddress ? `${local}@${asciiHost}` : undefined;
};

/** What reads an address for an email validator: one of the two below. */
export type ReadAddress = (text: string, allowPlus: boolean, allowLocal: boolean) => string | undefined;

/**
 * Reads an email address whose domain may be internationalized, shared by `internationalEmail` and the
 * `mailto` addresses of `url`: the domain is the one the URL parser reads. The host must be a public
 * domain name, or with `allowLocal` any hostname, such as `localhost` or `intranet`, as `hostname`
 * accepts it, whose punycode the parser has already decoded. An IP address is no hostname, written as one
 * (`127.0.0.1`) or as a number the parser reads as one (`0x7f000001`).
 */
export const toEmailAddress: ReadAddress = (text, allowPlus, allowLocal) =>
  addressOf(text, allowPlus, toAsciiHost, allowLocal ? isHostname : isPublicHost);

/**
 * Reads an email address whose domain is written in ASCII, for `email`: the domain is lowercased, and
 * one with a letter beyond ASCII or a punycode label is no address here. The rules of
 * {@link toEmailAddress} hold for the rest.
 */
export const toPlainEmailAddress: ReadAddress = (text, allowPlus, allowLocal) =>
  addressOf(text, allowPlus, toPlainHost, allowLocal ? isPlainHostname : isPlainPublicHost);
