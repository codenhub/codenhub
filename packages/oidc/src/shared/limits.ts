/** Bytes a provider reads from a request body; a client assertion signed with RSA-4096 is about 1 KB. */
export const MAX_BODY_BYTES = 16384;

/**
 * Bytes a provider reads from the form body of a request the browser sends, such as authorization or logout. It is
 * larger than {@link MAX_BODY_BYTES} so an `id_token_hint` as long as the ID tokens a client accepts fits.
 */
export const MAX_FRONT_CHANNEL_BODY_BYTES = 81920;

/** Parameters in one query string or form body; the largest legitimate request uses about a dozen. */
export const MAX_PARAMETERS = 32;

/** Characters in one decoded parameter; a client assertion signed with RSA-4096 fits in 4096 characters. */
export const MAX_PARAMETER_LENGTH = 4096;

/** Characters in a request URL a provider reads; it bounds the query string before parsing. */
export const MAX_URL_LENGTH = 8192;

/** Bytes a client reads from a response body; a JWKS or discovery document is far smaller. */
export const MAX_RESPONSE_BYTES = 65536;

/** Characters in an ID token the client accepts: the token response that carries it holds no more. */
export const MAX_ID_TOKEN_LENGTH = MAX_RESPONSE_BYTES;
