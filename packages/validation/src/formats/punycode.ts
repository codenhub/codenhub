/*
 * Punycode (RFC 3492), decoding only. The URL parser of Node.js and Firefox refuses a label written
 * `xn--` that does not decode to a valid internationalized label, and the parser of Chromium and WebKit
 * reads it as a host, so `xn--zz.com` passed in two engines and failed in the others. The labels are
 * decoded here instead, which reads every runtime the same.
 */

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX_INT = 0x7f_ff_ff_ff;
const MAX_CODE_POINT = 0x10_ff_ff;

/** The value of a digit, a letter as 0 to 25 and a decimal digit as 26 to 35, or 36 for anything else. */
function digitOf(code: number): number {
  if (code >= 0x30 && code <= 0x39) {
    return code - 22;
  }
  const lower = code | 0x20;
  return lower >= 0x61 && lower <= 0x7a ? lower - 0x61 : BASE;
}

/** The bias for the next delta, from RFC 3492 section 6.1. */
function adapt(delta: number, points: number, isFirst: boolean): number {
  let scaled = isFirst ? Math.floor(delta / DAMP) : delta >> 1;
  scaled += Math.floor(scaled / points);
  let k = 0;
  while (scaled > ((BASE - T_MIN) * T_MAX) >> 1) {
    scaled = Math.floor(scaled / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * scaled) / (scaled + SKEW));
}

/**
 * Decodes the punycode of a label, the text after `xn--`, or gives undefined when it is not punycode:
 * a non-ASCII basic code point, a digit that is not one, a number that does not end, or one that
 * overflows or names no code point.
 */
export function fromPunycode(text: string): string | undefined {
  const output: number[] = [];
  const delimiter = text.lastIndexOf("-");
  for (let index = 0; index < Math.max(delimiter, 0); index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0x80) {
      return undefined;
    }
    output.push(code);
  }
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let index = delimiter > 0 ? delimiter + 1 : 0; index < text.length; ) {
    const previous = i;
    let weight = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= text.length) {
        return undefined;
      }
      const digit = digitOf(text.charCodeAt(index));
      index += 1;
      if (digit >= BASE || digit > Math.floor((MAX_INT - i) / weight)) {
        return undefined;
      }
      i += digit * weight;
      const threshold = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < threshold) {
        break;
      }
      if (weight > Math.floor(MAX_INT / (BASE - threshold))) {
        return undefined;
      }
      weight *= BASE - threshold;
    }
    const length = output.length + 1;
    bias = adapt(i - previous, length, previous === 0);
    n += Math.floor(i / length);
    if (n > MAX_CODE_POINT) {
      return undefined;
    }
    i %= length;
    output.splice(i, 0, n);
    i += 1;
  }
  // A label is at most 63 characters, so this spreads at most that many.
  return String.fromCodePoint(...output);
}

/** A label written in punycode. */
const PUNYCODE_LABEL_PATTERN = /^xn--/i;
/**
 * A punycode label whose own text starts with `xn--` too, which Node.js writes for a letter before
 * `xn--`, as `éxn--` is `xn--xn---9oa`, and then refuses to read, where the browsers read it.
 */
const NESTED_PUNYCODE_LABEL_PATTERN = /^xn--xn--/i;

/**
 * Tests whether every `xn--` label of an ASCII host decodes to text that the URL parser writes back as
 * that same label: valid punycode, of a valid internationalized label, in the one spelling it has. The
 * parser checks the Unicode label the same way in every engine, where an `xn--` label it is given is
 * checked in some and read as written in others. A label Node.js cannot read again is refused in every
 * runtime, so a value that passes can be parsed wherever it is used.
 */
export const isPunycodeHost = (host: string): boolean =>
  host.split(".").every((label) => {
    if (!PUNYCODE_LABEL_PATTERN.test(label)) {
      return true;
    }
    if (NESTED_PUNYCODE_LABEL_PATTERN.test(label)) {
      return false;
    }
    const decoded = fromPunycode(label.slice(4));
    return (
      decoded !== undefined &&
      URL.canParse(`http://${decoded}`) &&
      new URL(`http://${decoded}`).hostname === label.toLowerCase()
    );
  });
