/** Checks for ASCII control characters without allocating an intermediate character array. @internal */
export function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const characterCode = value.charCodeAt(index);

    if (characterCode <= 0x1f || characterCode === 0x7f) {
      return true;
    }
  }

  return false;
}

/** The longest translation key, once trimmed. @internal */
export const MAX_TRANSLATION_KEY_LENGTH = 1_000;
// Surrounding whitespace is trimmed before the limit applies, as from a template or a form; a longer string is refused
// before it is trimmed or scanned.
const MAX_UNTRIMMED_KEY_LENGTH = 10 * MAX_TRANSLATION_KEY_LENGTH;

/**
 * Trims a string that can name a dictionary entry: not blank, within the length limit once trimmed, and free of ASCII
 * controls, surrounding ones included; otherwise `undefined`. @internal
 */
export const normalizeTranslationKey = (key: string): string | undefined => {
  if (key.length > MAX_UNTRIMMED_KEY_LENGTH) {
    return undefined;
  }
  const trimmed = key.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TRANSLATION_KEY_LENGTH && !hasAsciiControlCharacter(key)
    ? trimmed
    : undefined;
};
