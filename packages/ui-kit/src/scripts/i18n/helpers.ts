export const normalizeValue = (value: string | null | undefined): string | undefined => {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
};
