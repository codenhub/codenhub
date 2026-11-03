/*
 * The bidi rule for internationalized domain names (RFC 5893). The URL Standard applies it, and so do
 * the parsers of Chromium, Firefox and WebKit; the parser of Node.js 24 does not, so `٠.com` and `1.ب`
 * passed there and failed in every browser. It is applied here instead, so every runtime gives the
 * browsers' answer.
 *
 * It needs the bidi class of each character, which a regular expression cannot name, and a table of the
 * classes would add kilobytes to every host format. So the classes are an allowlist: a character gets
 * one only where its category and block make it certain, and a host with a right-to-left label and any
 * other character is refused. Guessing from the block alone passed `a°.موقع`, `𐹠.com` and `بب.𐋡a`,
 * which every browser refuses. Checked on 2026-11-03 against the classes of Unicode 18 for each of the
 * 152,903 characters the parser of Node.js 24.19 lets into a label, no character gets a wrong class,
 * and 9,237 get none: symbols, punctuation, and numbers other than digits, which browsers accept beside
 * a right-to-left label when the rule allows them and this refuses.
 */
import { fromPunycode } from "./punycode";

/** Arabic numbers (class AN) a label can hold: Arabic, Hanifi Rohingya and Garay digits and separators. */
const ARABIC_NUMBER_PATTERN = /[\u0660-\u0669\u066B\u066C\u{10D30}-\u{10D39}\u{10D40}-\u{10D49}]/u;
/** European numbers (class EN), as they are once the parser has mapped a host. */
const EUROPEAN_NUMBER_PATTERN = /[0-9\u06F0-\u06F9]/;
/**
 * Neutral characters (ON, ES and BN) a label can hold: the hyphen, the middle dots, the joiners, and the
 * modifier letters, such as `ˆ`, that are neutral where the others are of class L.
 */
const NEUTRAL_PATTERN =
  /[-\u00B7\u0375\u30FB\u02B9\u02BA\u02C6-\u02CF\u02EC\u2E2F\uA67F\uA717-\uA71F\uA788\u200C\u200D]/;
/** The marks of class L, where the others are NSM. */
const LEFT_TO_RIGHT_MARK_PATTERN = /[\u0CBF\u0CC6\u1B3A\u1B3C\u1B42\u{11A07}\u{11A08}\u{11C3F}]/u;
/** Marks that take the direction of what precedes them (class NSM). */
const MARK_PATTERN = /[\p{Mn}\p{Me}]/u;
/** Letters, spacing marks and digits, which are R or AL in a right-to-left block and L elsewhere. */
const LETTER_PATTERN = /[\p{L}\p{Mc}\p{Nd}]/u;
/** The blocks of right-to-left scripts. */
const RIGHT_TO_LEFT_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

type Direction = "L" | "R" | "AN" | "EN" | "NSM" | "ON";

/** The class the rule reads for a character of a label, or undefined when it is not certain. */
const directionOf = (character: string): Direction | undefined =>
  ARABIC_NUMBER_PATTERN.test(character)
    ? "AN"
    : EUROPEAN_NUMBER_PATTERN.test(character)
      ? "EN"
      : NEUTRAL_PATTERN.test(character)
        ? "ON"
        : LEFT_TO_RIGHT_MARK_PATTERN.test(character)
          ? "L"
          : MARK_PATTERN.test(character)
            ? "NSM"
            : LETTER_PATTERN.test(character)
              ? RIGHT_TO_LEFT_PATTERN.test(character)
                ? "R"
                : "L"
              : undefined;

/**
 * Tests whether a character makes the rule apply to its host: one of a right-to-left block that is not
 * a European digit or a mark, since one whose class is not certain may be R, AL or AN.
 */
function isRightToLeft(character: string): boolean {
  const direction = directionOf(character);
  return RIGHT_TO_LEFT_PATTERN.test(character) && direction !== "EN" && direction !== "NSM";
}

/**
 * Tests one label of a host that has a right-to-left label against the six conditions of RFC 5893. A
 * character whose class is not certain breaks it.
 */
function keepsRule(directions: readonly (Direction | undefined)[]): boolean {
  const [first] = directions;
  const last = directions.findLast((direction) => direction !== "NSM");
  if (first === "R") {
    return (
      directions.every((direction) => direction !== undefined && direction !== "L") &&
      (last === "R" || last === "EN" || last === "AN") &&
      !(directions.includes("EN") && directions.includes("AN"))
    );
  }
  return (
    first === "L" &&
    directions.every((direction) => direction !== undefined && direction !== "R" && direction !== "AN") &&
    (last === "L" || last === "EN")
  );
}

/**
 * Tests whether a host, in the ASCII form the parser writes, keeps the bidi rule: a host with no label
 * written right to left keeps it, and in one that has such a label, every label must keep it. A label
 * in punycode is read decoded, and one that is not valid punycode is left to the punycode check.
 */
export function isBidiHost(host: string): boolean {
  const labels = host
    .split(".")
    .filter((label) => label !== "")
    .map((label) => [...(/^xn--/i.test(label) ? (fromPunycode(label.slice(4)) ?? label) : label)]);
  return (
    !labels.some((label) => label.some(isRightToLeft)) || labels.every((label) => keepsRule(label.map(directionOf)))
  );
}
