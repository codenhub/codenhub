/** Bytes a provider reads from a request body; a client assertion signed with RSA-4096 is about 1 KB. */
export const MAX_BODY_BYTES = 16384;

/** Parameters in one query string or form body; the largest legitimate request uses about a dozen. */
export const MAX_PARAMETERS = 32;

/** Characters in one decoded parameter; a client assertion signed with RSA-4096 fits in 4096 characters. */
export const MAX_PARAMETER_LENGTH = 4096;

/** Characters in a request URL a provider reads; it bounds the query string before parsing. */
export const MAX_URL_LENGTH = 8192;

/** Bytes a client reads from a response body; a JWKS or discovery document is far smaller. */
export const MAX_RESPONSE_BYTES = 65536;
