import { describe, expect, it } from "vitest";

import { accepts } from "../test-utils";
import { isBidiHost } from "./bidi";
import { domain } from "./domain";
import { email } from "./email";
import { hostname } from "./hostname";
import { url } from "./url";

/*
 * Browsers apply the bidi rule of RFC 5893 to a host and Node.js 24 does not, so each case here is
 * what Chromium, Firefox and WebKit answer, and every runtime must answer the same.
 */
const REJECTED = ["٠.com", "٠ب.com", "a٠.com", "١.com", "٫.com", "1.ب", "בa.com", "aב.com", "ب1a.com", "ب٠1.com"];
const ACCEPTED = ["ب٠.com", "ب.com", "ب١.com", "۰.com", "בּ.com", "ב1.com", "ب-ب.com", "münchen.de", "1a.com"];

describe("isBidiHost", () => {
  it("should accept a host with no right-to-left label, and one whose labels keep the bidi rule", () => {
    expect(["example.com", "xn--ngb.com", "xn--ngb6i.com", "xn--dmb.com", "1.example"].map(isBidiHost)).toEqual(
      Array(5).fill(true),
    );
  });

  it("should reject a host whose labels break the bidi rule, written in punycode", () => {
    // ٠.com, ٠ب.com, a٠.com and 1.ب.
    expect(["xn--8hb.com", "xn--ngb5i.com", "xn--a-8pc.com", "1.xn--ngb"].map(isBidiHost)).toEqual(
      Array(4).fill(false),
    );
  });
});

describe("the bidi rule in the formats", () => {
  it("should reject in domain, email and url what browsers reject, and accept what they accept", () => {
    expect(accepts(domain(), ...REJECTED)).toEqual(Array(REJECTED.length).fill(false));
    expect(accepts(domain(), ...ACCEPTED)).toEqual(Array(ACCEPTED.length).fill(true));
    expect(accepts(email(), ...REJECTED.map((host) => `a@${host}`))).toEqual(Array(REJECTED.length).fill(false));
    expect(accepts(url(), ...REJECTED.map((host) => `https://${host}/`))).toEqual(Array(REJECTED.length).fill(false));
    expect(accepts(url(), ...ACCEPTED.map((host) => `https://${host}/`))).toEqual(Array(ACCEPTED.length).fill(true));
  });

  it("should apply it to a host written in punycode", () => {
    expect(accepts(hostname(), "xn--8hb.com", "1.xn--ngb", "xn--ngb6i.com")).toEqual([false, false, true]);
  });

  it("should reject a host with a right-to-left label and a character whose class it does not know", () => {
    // ¡ and ° are neutrals, so a label cannot end with them; U+10E60 is an Arabic number and U+102E1 a
    // European one, so neither can start a label. A guess from the block called them letters.
    expect(accepts(url(), "http://a¡.بب/", "http://a°.موقع/", "http://𐹠.com/")).toEqual([false, false, false]);
    expect(accepts(domain(), "𐹠.com", "بب.𐋡a")).toEqual([false, false]);
    expect(accepts(email(), "x@بب.𐋡a")).toEqual([false]);
    // a¡.بب in punycode.
    expect(accepts(hostname(), "xn--a-6ba.xn--ngba")).toEqual([false]);
  });

  it("should keep accepting letters, modifier letters and marks it knows the class of", () => {
    // A Japanese label with the long-vowel mark, a Kannada one with a vowel sign of class L, and an
    // Arabic one with a Hebrew point, beside a right-to-left label.
    expect(accepts(domain(), "ب.ラーメン", "ب.ಕಿ", "بּ.com")).toEqual([true, true, true]);
  });
});
