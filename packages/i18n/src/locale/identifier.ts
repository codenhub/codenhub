const LOCALE_IDENTIFIER_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

/** Checks whether a value is a conservative ASCII locale identifier. @internal */
export function isValidLocaleIdentifier(value: string): boolean {
  return LOCALE_IDENTIFIER_PATTERN.test(value);
}
