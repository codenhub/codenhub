import { expect, test } from "@playwright/test";

import * as validation from "../../dist/index.js";

/*
 * The formats that read text with the URL parser return what it read, and the parser is the runtime's
 * own: a different one in Node.js and in each browser engine. A schema is often run in both, on a form
 * and on the server, so each engine must give the answer Node.js gives for the same text. Each case is
 * run by the built package in this process, which is Node.js, and in the page, and every difference is
 * listed.
 */

type Module = typeof validation;

/**
 * Validates every input with the validator `name` makes, and gives each result as text: the value, or
 * `✗`. It is sent to the page as source, so it uses nothing from the scope around it.
 */
function answers(module: Module, name: string, inputs: readonly string[]): string[] {
  const made: Record<string, () => (input: unknown) => unknown> = {
    url: () => module.url({ protocols: ["http", "https", "ssh", "mailto", "tel", "urn"] }),
    email: () => module.email(),
    domain: () => module.domain(),
    hostname: () => module.hostname(),
    ip: () => module.ip(),
    cidr: () => module.cidr(),
    coerceDate: () => module.coerceDate(),
    coerceNumber: () => module.coerceNumber(),
  };
  const validator = (made[name] as () => (input: unknown) => unknown)();
  return inputs.map((input) => {
    try {
      const result = validator(input) as { ok: boolean; value?: unknown };
      return result.ok ? String(result.value instanceof Date ? result.value.getTime() : result.value) : "✗";
    } catch (error) {
      return `threw ${String(error)}`;
    }
  });
}

/**
 * Characters that parsers map, drop, or treat differently from one another, and ordinary ones to mix
 * them with: soft hyphen, zero-width space and joiner, combining grapheme joiner, variation selector,
 * ideographic and fullwidth full stops, a fullwidth letter, a combining diaeresis, dotted capital I,
 * the "ff" ligature, the Hangul filler, the Arabic tatweel, Arabic-Indic and extended digits, final
 * sigma, sharp s, and letters, digits and marks of right-to-left scripts, which the bidi rule reads.
 */
const HOST_PIECES = [
  ..."exEM1-.",
  "xn--",
  "xn--mnchen-3ya",
  "ü",
  "ß",
  "ς",
  "a",
  "0x",
  ...[
    0xad, 0x20_0b, 0x20_0d, 0x03_4f, 0xfe_0f, 0x30_02, 0xff_0e, 0xff_45, 0x03_08, 0x01_30, 0xfb_00, 0x31_64, 0x06_40,
    0x06_60, 0x06_61, 0x06_f0, 0x05_d0, 0x05_bc, 0x06_28, 0x06_4e, 0x07_10, 0x07_c0, 0x07_ca, 0x1_e9_00, 0x1_e9_50,
  ].map((code) => String.fromCodePoint(code)),
];

/** The same seeded generator as the parser agreement tests, so a failure names an input that reproduces it. */
function strings(seed: number, count: number, length: number, pieces: readonly string[]): string[] {
  let state = seed;
  const next = (bound: number): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % bound;
  };
  return Array.from({ length: count }, () =>
    Array.from({ length: 1 + next(length) }, () => pieces[next(pieces.length)]).join(""),
  );
}

const HOSTS = strings(7, 2000, 8, HOST_PIECES).map((host, index) => host + ["", ".com", ".de", ".xn--p1ai"][index % 4]);

const CASES: Record<string, readonly string[]> = {
  domain: HOSTS,
  hostname: HOSTS,
  url: [
    ...HOSTS.map((host) => `https://${host}/`),
    ...strings(11, 500, 6, [
      "https://",
      "ssh://",
      "example.com",
      "/",
      "..",
      "%2e",
      "%41",
      "\\",
      "@",
      "?",
      "#",
      "ü",
      ":80",
    ]),
    ...strings(13, 500, 6, [
      "mailto:",
      "tel:",
      "urn:",
      "a@example.com",
      ",",
      "?",
      "to=",
      "body=",
      "%0d%0a",
      "+1",
      "-",
      "isbn:",
    ]),
  ],
  email: HOSTS.map((host, index) => `${["a", "Ada.L", "x+y", "a_b"][index % 4]}@${host}`),
  ip: strings(17, 1000, 7, [
    "::",
    ":",
    "1",
    "ffff",
    "FFFF",
    "0",
    ".",
    "127",
    "255",
    "256",
    "%eth0",
    "%",
    "64:ff9b",
    "0x1",
  ]),
  cidr: strings(19, 500, 7, ["10.0.0.0", "::", "1", "/", "/8", "/32", "/128", "/129", "/08", "ffff"]),
  coerceDate: [
    ...strings(23, 500, 8, ["2026", "-", "02", "29", "T", " ", "10", ":", "00", ".", "5", "Z", "+", "05", "30", "24"]),
    "2026-09-28",
    "2026-09-28T10:00Z",
    "2026-09-28 10:00:00.123456+05:30",
    "0000-01-01",
  ],
  coerceNumber: strings(29, 500, 5, ["1", "0", "-", "+", ".", "e", "5", " ", "0x", "Infinity", "١", "_", ","]),
};

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
});

for (const [name, inputs] of Object.entries(CASES)) {
  test(`${name} gives the answer Node.js gives`, async ({ page }) => {
    const expected = answers(validation, name, inputs);
    const received = await page.evaluate(
      ([source, format, list]) => {
        // The function is sent as its source, since a function cannot cross into the page.
        // oxlint-disable-next-line typescript/no-implied-eval, no-new-func
        const run = new Function(`return (${source})`)() as typeof answers;
        return run((globalThis as unknown as { validation: Module }).validation, format, list);
      },
      [answers.toString(), name, inputs] as const,
    );
    const differences = inputs.flatMap((input, index) =>
      expected[index] === received[index] ? [] : [{ input, node: expected[index], browser: received[index] }],
    );
    expect(differences).toEqual([]);
  });
}
