/*
 * The bidi rule for internationalized domain names (RFC 5893). The URL Standard applies it, and so do
 * the parsers of Chromium, Firefox and WebKit; the parser of Node.js 24 does not, so `٠.com` and `1.ب`
 * passed there and failed in every browser. It is applied here instead, so every runtime gives the
 * browsers' answer.
 *
 * It needs the bidi class of each character, which a regular expression cannot name. The host has
 * already passed the parser, so only characters valid in a label reach it, and of those the classes the
 * rule tells apart are found by where they are: right-to-left letters and digits live in a few blocks,
 * Arabic digits in fewer, and marks are their own category.
 */
import { fromPunycode } from "./punycode";

/** Arabic numbers (class AN) a label can hold; the parser refuses the rest of the class. */
const ARABIC_NUMBER_PATTERN = /[\u0660-\u0669\u066B\u066C\u{10D30}-\u{10D39}]/u;
/** European numbers (class EN), as they are once the parser has mapped a host. */
const EUROPEAN_NUMBER_PATTERN = /[0-9\u06F0-\u06F9]/;
/** Marks that take the direction of what precedes them (class NSM). */
const MARK_PATTERN = /[\p{Mn}\p{Me}]/u;
/** The blocks of right-to-left scripts, whose other characters a label can hold are letters (R or AL). */
const RIGHT_TO_LEFT_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
/** The neutral characters a label can hold: the hyphen, the middle dots and the joiners. */
const NEUTRAL_PATTERN = /[-\u00B7\u0375\u30FB\u200C\u200D]/;

type Direction = "L" | "R" | "AN" | "EN" | "NSM" | "ON";

const directionOf = (character: string): Direction =>
  ARABIC_NUMBER_PATTERN.test(character)
    ? "AN"
    : EUROPEAN_NUMBER_PATTERN.test(character)
      ? "EN"
      : MARK_PATTERN.test(character)
        ? "NSM"
        : RIGHT_TO_LEFT_PATTERN.test(character)
          ? "R"
          : NEUTRAL_PATTERN.test(character)
            ? "ON"
            : "L";

/** Tests one label of a host that has a right-to-left label against the six conditions of RFC 5893. */
function keepsRule(directions: readonly Direction[]): boolean {
  const [first] = directions;
  const last = directions.findLast((direction) => direction !== "NSM");
  if (first === "R") {
    return (
      directions.every((direction) => direction !== "L") &&
      (last === "R" || last === "EN" || last === "AN") &&
      !(directions.includes("EN") && directions.includes("AN"))
    );
  }
  return (
    first === "L" &&
    directions.every((direction) => direction !== "R" && direction !== "AN") &&
    (last === "L" || last === "EN")
  );
}

/**
 * Tests whether a host, in the ASCII form the parser writes, keeps the bidi rule: a host with no label
 * written right to left keeps it, and in one that has such a label, every label must keep it. A label
 * that is not valid punycode is left to the punycode check.
 */
export function isBidiHost(host: string): boolean {
  const labels = host
    .split(".")
    .filter((label) => label !== "")
    .map((label) => [...(/^xn--/i.test(label) ? (fromPunycode(label.slice(4)) ?? label) : label)].map(directionOf));
  const isBidi = labels.some((directions) => directions.some((direction) => direction === "R" || direction === "AN"));
  return !isBidi || labels.every(keepsRule);
}
