// What each record of warnings keeps, in characters, as the parse cache counts its own: about 1,000 typical keys, or
// 94 of the longest. A server creates a manager per request, so the records are shared by every manager in the process
// and kept for its life; a bound by count alone let them hold whatever each entry's text held.
/** @internal */
export const MAX_WARNING_COST = 100_000;
// A record's entry beside its key, about 130 bytes on Node.js 26.13, as the parse cache's `ENTRY_COST` measures it.
const ENTRY_COST = 64;

/**
 * Remembers the most recent warnings within `MAX_WARNING_COST`, so each warns once while it is remembered. A repeat moves
 * to the newest end, so the record forgets the warning least recently seen.
 *
 * @internal
 */
export class WarningRecord {
  private readonly entries = new Map<string, number>();
  private totalCost = 0;

  /** What the record keeps, in characters. */
  get cost(): number {
    return this.totalCost;
  }

  /** Records a warning, returning whether it is new. */
  remember(warningKey: string): boolean {
    const known = this.entries.get(warningKey);
    if (known !== undefined) {
      this.entries.delete(warningKey);
      this.entries.set(warningKey, known);
      return false;
    }

    const cost = ENTRY_COST + warningKey.length;
    while (this.entries.size > 0 && this.totalCost + cost > MAX_WARNING_COST) {
      const [oldest, oldestCost] = this.entries.entries().next().value!;
      this.entries.delete(oldest);
      this.totalCost -= oldestCost;
    }
    if (cost <= MAX_WARNING_COST) {
      this.entries.set(warningKey, cost);
      this.totalCost += cost;
    }
    return true;
  }
}

/**
 * A 53-bit hash of a text (cyrb53), so a warning about a message is remembered by a short key whatever its length, and
 * an edited text warns again.
 *
 * @internal
 */
export const hashText = (text: string): string => {
  let first = 0xdeadbeef ^ text.length;
  let second = 0x41c6ce57 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2_654_435_761);
    second = Math.imul(second ^ code, 1_597_334_677);
  }
  first = Math.imul(first ^ (first >>> 16), 2_246_822_507);
  first ^= Math.imul(second ^ (second >>> 13), 3_266_489_909);
  second = Math.imul(second ^ (second >>> 16), 2_246_822_507);
  second ^= Math.imul(first ^ (first >>> 13), 3_266_489_909);
  return `${(4_294_967_296 * (second & 0x1f_ffff) + (first >>> 0)).toString(36)}:${text.length}`;
};

/** Missing keys, by locale and key. @internal */
export const warnedMissingKeys = new WarningRecord();
/** Invalid messages, by locale, key, and a hash of the text. @internal */
export const warnedMessages = new WarningRecord();
