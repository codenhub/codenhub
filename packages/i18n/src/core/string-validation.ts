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
