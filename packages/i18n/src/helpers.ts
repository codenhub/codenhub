/**
 * Normalizes a string value by trimming it and returning undefined if it is empty.
 *
 * @param value - The raw string value.
 * @returns The normalized string or undefined.
 * @internal
 */
export const normalizeValue = (value: string | null | undefined): string | undefined => {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
};
