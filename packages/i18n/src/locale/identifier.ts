import { canonicalizeTag } from "./likely-subtags";

const LOCALE_IDENTIFIER_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
// A private-use tag, which `Intl` rejects, as BCP 47 writes it: `x` and subtags of 1 to 8 characters.
const PRIVATE_USE_TAG_PATTERN = /^x(?:-[a-z0-9]{1,8})+$/i;

/** Checks whether a value is a conservative ASCII locale identifier. @internal */
export function isValidLocaleIdentifier(value: string): boolean {
  return LOCALE_IDENTIFIER_PATTERN.test(value);
}

/**
 * Checks whether a value is a language tag `Intl` accepts, such as `pt-BR`, or a private-use tag, such as `x-pirate`,
 * which `Intl` rejects but an app may use for a locale of its own.
 *
 * @internal
 */
export function isLanguageTag(value: string): boolean {
  return PRIVATE_USE_TAG_PATTERN.test(value) || canonicalizeTag(value) !== undefined;
}
