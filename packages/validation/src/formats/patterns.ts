/** A domain name with at least one dot and a real top-level domain, which is what "public" means for email and URL hosts. */
export const PUBLIC_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,}|xn--[a-z0-9-]{1,59})$/i;
