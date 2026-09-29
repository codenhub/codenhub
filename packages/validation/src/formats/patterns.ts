/** A domain name with at least one dot and a real top-level domain. */
const DOMAIN_NAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,}|xn--[a-z0-9-]{1,59})$/i;

/**
 * Special-use names that look like domain names but never name a public host: `localhost`, `local`,
 * `internal` and `home.arpa` resolve on the local network or machine, and the rest are reserved for
 * testing, documentation or other networks (RFC 6761, 6762, 7686, 8375 and 9476, and ICANN's
 * `.internal`).
 */
const SPECIAL_USE_NAME_PATTERN = /(?:^|\.)(?:localhost|local|internal|test|example|invalid|alt|onion|home\.arpa)$/i;

/** Tests whether a host is a public domain name, which is what "public" means for email and URL hosts. */
export const isPublicHost = (host: string): boolean =>
  DOMAIN_NAME_PATTERN.test(host) && !SPECIAL_USE_NAME_PATTERN.test(host);
