import { describe, expect, it } from "vitest";

import type { Validator } from "../core/types";
import { email } from "./email";
import { url } from "./url";

/*
 * `url` and `email` return what the URL parser reads, so a check made later on the returned text sees
 * the same URL or host that a request or a mail server will use. These tests do not list the ways text
 * can be read differently from how it looks; they build many strings out of the characters that cause
 * that, and assert the invariant for every one the validators accept.
 */

/**
 * Characters the parser removes, maps or reads as structure, and ordinary ones to mix them with. The
 * invisible ones are written as code points so the source shows them: soft hyphen, zero-width space and
 * joiner, combining grapheme joiner, variation selector, ideographic and fullwidth full stops,
 * fullwidth "e", a combining diaeresis and a line separator.
 */
const PIECES = [
  ..."exEM1-./\\@:",
  "%2e",
  "%41",
  "..",
  "/..",
  "ü",
  "ß",
  ...[0xad, 0x20_0b, 0x20_0d, 0x03_4f, 0xfe_0f, 0x30_02, 0xff_0e, 0xff_45, 0x03_08, 0x20_28].map((code) =>
    String.fromCodePoint(code),
  ),
];

/**
 * What the parts of a URL without a host are made of: recipients in several spellings, the fields and
 * separators of a mailto query, escapes of the characters that end an address, tel parameters, and
 * characters that are unsafe in markup.
 */
const HOSTLESS_PIECES = [
  "ada",
  "Bob",
  "@example.com",
  "@EXAMPLE.org",
  "@exa%6dple.com",
  "@münchen.de",
  "?",
  "&",
  "=",
  ",",
  "to=",
  "Cc=",
  "subject=",
  "%3f",
  "%26",
  "%2B",
  "%25",
  "+",
  "//",
  ";x=",
  "1",
  "isbn:",
  '"',
  "<",
  "'",
];

/**
 * A seeded generator, so a failure names an input that reproduces it.
 *
 * @yields Strings of one to `length` pieces.
 */
function* strings(seed: number, count: number, length: number, pieces = PIECES): Generator<string> {
  let state = seed;
  const next = (bound: number): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % bound;
  };
  for (let index = 0; index < count; index += 1) {
    yield Array.from({ length: 1 + next(length) }, () => pieces[next(pieces.length)]).join("");
  }
}

/** Runs a validator on every text and returns the values it accepted, keyed by the text they came from. */
const accepted = (validate: Validator<string>, texts: Iterable<string>): [string, string][] =>
  [...texts].flatMap((text) => {
    const result = validate(text);
    return result.ok ? [[text, result.value] as [string, string]] : [];
  });

describe("agreement with the URL parser", () => {
  it.each([
    ["public", url()],
    ["local", url({ allowLocal: true })],
  ])("url (%s) should only ever return a URL the parser writes back unchanged", (_, validate) => {
    const texts = [...strings(7, 4000, 6)].flatMap((noise) => [
      `https://ex${noise}ample.com/a`,
      `https://example.com/${noise}`,
      `http://${noise}`,
    ]);
    const values = accepted(validate, texts);
    expect(values.length).toBeGreaterThan(1000);
    expect(values.filter(([, value]) => new URL(value).href !== value)).toEqual([]);
    expect(values.filter(([, value]) => valueOf(validate(value)) !== value)).toEqual([]);
  });

  it("email should only ever return a domain the parser writes back unchanged", () => {
    const validate = email();
    const values = accepted(
      validate,
      [...strings(11, 4000, 5)].map((noise) => `ada@ex${noise}ample.com`),
    );
    expect(values.length).toBeGreaterThan(100);
    const domainOf = (address: string): string => address.slice(address.indexOf("@") + 1);
    expect(values.filter(([, value]) => new URL(`http://${domainOf(value)}`).hostname !== domainOf(value))).toEqual([]);
    expect(values.filter(([, value]) => valueOf(validate(value)) !== value)).toEqual([]);
  });
});

describe("agreement with the URL parser, without a host", () => {
  const validate = url({ protocols: ["mailto", "tel", "urn"] });
  const texts = [...strings(13, 4000, 6, HOSTLESS_PIECES)].flatMap((noise) => [
    `mailto:${noise}`,
    `mailto:ada@example.com?${noise}`,
    `mailto://${noise}`,
    `tel:+1${noise}`,
    `urn:${noise}`,
  ]);
  const values = accepted(validate, texts);

  it("should only ever return a URL without a host that the parser writes back unchanged", () => {
    expect(values.length).toBeGreaterThan(300);
    expect(values.filter(([, value]) => new URL(value).host !== "" || new URL(value).href !== value)).toEqual([]);
    expect(values.filter(([, value]) => valueOf(validate(value)) !== value)).toEqual([]);
  });

  it("should never return a character that could end a quoted attribute or start markup", () => {
    expect(values.filter(([, value]) => /["<>`]/.test(value))).toEqual([]);
  });

  it("should only ever return mailto recipients as email() returns them", () => {
    const recipients = values
      .map(([, value]) => value)
      .filter((value) => value.startsWith("mailto:"))
      .flatMap((value) => {
        const [path = "", query = ""] = value.slice("mailto:".length).split("?");
        const fields = query === "" ? [] : query.split("&");
        const listed = fields
          .filter((field) => /^(?:to|cc|bcc)=/.test(field))
          .map((field) => field.slice(field.indexOf("=") + 1));
        return [path, ...listed].filter((list) => list !== "").flatMap((list) => list.split(","));
      });
    expect(recipients.length).toBeGreaterThan(100);
    const address = email();
    expect(
      recipients.filter(
        (recipient) => valueOf(address(decodeURIComponent(recipient))) !== decodeURIComponent(recipient),
      ),
    ).toEqual([]);
  });
});

/** The value of a result, or undefined for a failure. */
function valueOf(result: ReturnType<Validator<string>>): string | undefined {
  return result.ok ? result.value : undefined;
}
