import { describe, expect, it } from "vitest";

import { coerceBigint } from "../coercion/coerce-bigint";
import { coerceBoolean } from "../coercion/coerce-boolean";
import { coerceDate } from "../coercion/coerce-date";
import { coerceNumber } from "../coercion/coerce-number";
import type { AnyValidator } from "../core/types";
import { base64 } from "./base64";
import { cidr } from "./cidr";
import { creditCard } from "./credit-card";
import { cuid2 } from "./cuid2";
import { datetime } from "./datetime";
import { domain } from "./domain";
import { duration } from "./duration";
import { email } from "./email";
import { hex } from "./hex";
import { hostname } from "./hostname";
import { ip } from "./ip";
import { isoDate } from "./iso-date";
import { jwt } from "./jwt";
import { mac } from "./mac";
import { nanoid } from "./nanoid";
import { phone } from "./phone";
import { semver } from "./semver";
import { slug } from "./slug";
import { time } from "./time";
import { ulid } from "./ulid";
import { url } from "./url";
import { uuid } from "./uuid";

/*
 * Every validator that reads text with a regular expression, given long text built to make a
 * backtracking pattern try every way to split it. A pattern that matches in linear time answers each in
 * about a millisecond; one that backtracks would take seconds or never finish. The bound is generous, so
 * a busy machine does not fail it, and still far below what backtracking costs at this length.
 */
const LENGTH = 100_000;
const BOUND_MS = 1_000;

const validators: Record<string, AnyValidator> = {
  base64: base64(),
  base64url: base64({ url: true }),
  cidr: cidr(),
  creditCard: creditCard(),
  cuid2: cuid2(),
  datetime: datetime({ offset: true, local: true }),
  domain: domain(),
  duration: duration(),
  email: email(),
  hex: hex(),
  hostname: hostname(),
  ip: ip(),
  isoDate: isoDate(),
  jwt: jwt(),
  mac: mac(),
  nanoid: nanoid(),
  phone: phone(),
  semver: semver(),
  slug: slug(),
  time: time(),
  ulid: ulid(),
  url: url({ protocols: ["http", "https", "mailto", "tel", "urn", "ssh"] }),
  uuid: uuid(),
  coerceBigint: coerceBigint(),
  coerceBoolean: coerceBoolean(),
  coerceDate: coerceDate(),
  coerceNumber: coerceNumber(),
};

/** Repeats a unit to the length, and ends it with a character that makes the whole text fail. */
const adversarial = (unit: string): string => `${unit.repeat(Math.ceil(LENGTH / unit.length))}!`;

const units = [
  "a",
  "0",
  "1.",
  "a-",
  "a.",
  "-",
  ".",
  "%41",
  "xn--",
  "a@",
  "::",
  "1:",
  "ab:",
  "P1Y",
  "T1H",
  "1-",
  "aa_",
  "+1 ",
  "(1)",
  "=",
  "a/",
  "?a=1&",
  "mailto:a@b.co,",
  "\t",
];

describe("every format reads long adversarial text in linear time", () => {
  for (const [name, validate] of Object.entries(validators)) {
    // Every validator here is synchronous, so the time measured is the validation's alone.
    it(`${name} rejects each in under ${BOUND_MS}ms`, () => {
      for (const unit of units) {
        const text = adversarial(unit);
        const started = performance.now();
        const result = validate(text) as { ok: boolean };
        const elapsed = performance.now() - started;
        expect(result.ok, `${name} on ${JSON.stringify(unit)}`).toBe(false);
        expect(elapsed, `${name} on ${JSON.stringify(unit)}`).toBeLessThan(BOUND_MS);
      }
    });
  }
});

/*
 * A label written in punycode is decoded by the runtime's URL parser, and the time that takes grows with
 * the square of the label's length: in Node.js 24.19, `a@xn--` and 400,000 letters took five seconds. A
 * host is refused by its written length before the parser reads it, so such text is answered at once,
 * however it spells `xn--`.
 */
describe("every format that reads a host refuses a long punycode label without decoding it", () => {
  const label = "b".repeat(400_000);
  const hostless = url({ protocols: ["mailto"] });
  const cases: Record<string, [validate: AnyValidator, text: string]> = {
    email: [email(), `a@xn--${label}.com`],
    domain: [domain(), `xn--${label}.com`],
    url: [url(), `https://xn--${label}.com/`],
    "url, in capitals": [url(), `https://XN--${label}.com/`],
    "url, in fullwidth letters": [url(), `https://ｘｎ－－${label}.com/`],
    "url, with an escape": [url(), `https://%78n--${label}.com/`],
    "url, after credentials and in an inner label": [url(), `https://user@a.xn--${label}.com:8080/`],
    "a mailto recipient": [hostless, `mailto:a@xn--${label}.com`],
  };

  for (const [name, [validate, text]] of Object.entries(cases)) {
    it(`${name} rejects it in under ${BOUND_MS}ms`, () => {
      const started = performance.now();
      const result = validate(text) as { ok: boolean };
      const elapsed = performance.now() - started;
      expect(result.ok).toBe(false);
      expect(elapsed).toBeLessThan(BOUND_MS);
    });
  }
});
