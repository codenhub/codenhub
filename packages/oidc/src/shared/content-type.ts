const FORM_MEDIA_TYPE = "application/x-www-form-urlencoded";

/**
 * Tests the request's `Content-Type` for a form body (RFC 6749 §4.1.3). Parameters are allowed only as a UTF-8
 * charset, because the body is always decoded as UTF-8.
 */
export function isFormContentType(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const [mediaType, ...parameters] = value.split(";").map((part) => part.trim().toLowerCase());
  return (
    mediaType === FORM_MEDIA_TYPE && parameters.every((part) => part === "charset=utf-8" || part === 'charset="utf-8"')
  );
}
