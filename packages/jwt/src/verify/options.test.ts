import { describe, expect, it } from "vitest";

import { fail } from "../core/result";
import type { KeySet } from "../core/types";
import { createVerifier } from "./create-verifier";

const keys: KeySet = { select: async () => fail({ code: "no_matching_key" }) };
const schema = { "~standard": { version: 1, vendor: "test", validate: () => ({ value: {} }) } };

/** One test case per invalid value of an option, with the TypeError message it must produce. */
const casesOf = (name: string, constraint: string, values: readonly unknown[]): [string, unknown, string][] =>
  values.map((value) => [name, value, `createVerifier: options.${name} ${constraint}`]);

describe("createVerifier options", () => {
  it.each([
    ["options is not an object", null, "createVerifier: options must be an object."],
    ["keys is missing", {}, "createVerifier: options.keys must be a key set (an object with a select function)."],
    [
      "keys has no select function",
      { keys: { select: "x" } },
      "createVerifier: options.keys must be a key set (an object with a select function).",
    ],
  ])("should throw when %s", (_, options, message) => {
    expect(() => createVerifier(options as never)).toThrow(new TypeError(message));
  });

  it.each(["issuer", "audience"].flatMap((name) => ["", [], [""], ["a", 1], 1, null].map((value) => [name, value])))(
    "should throw when %s is %j",
    (name, value) => {
      expect(() => createVerifier({ keys, [name as string]: value } as never)).toThrow(
        new TypeError(
          `createVerifier: options.${name as string} must be a non-empty string or a non-empty array of non-empty strings.`,
        ),
      );
    },
  );

  it.each([
    ...casesOf("type", "must be a non-empty string.", ["", 1]),
    ...casesOf("clockTolerance", "must be an integer number of seconds from 0 through 300.", [
      -1,
      301,
      1.5,
      "1",
      Number.NaN,
    ]),
    ...casesOf("maxAge", "must be a positive integer number of seconds.", [0, -1, 1.5, "60", Number.POSITIVE_INFINITY]),
    ...casesOf("maxLength", "must be an integer from 1 through 65536.", [0, 65_537, 100.5, "100"]),
    ...casesOf("requiredClaims", "must be an array of non-empty strings.", ["sub", [""], ["sub", 1]]),
    ...casesOf("claims", "must be a Standard Schema (version 1, with a validate function).", [
      {},
      { "~standard": null },
      { "~standard": { version: 2, validate: () => ({ value: {} }) } },
      { "~standard": { version: 1, validate: "x" } },
      "schema",
    ]),
    ...casesOf("now", "must be a function returning milliseconds.", [1_800_000_000_000]),
  ])("should throw when %s is %j", (name, value, message) => {
    expect(() => createVerifier({ keys, [name]: value } as never)).toThrow(new TypeError(message));
  });

  it("should accept every option at its limits", () => {
    expect(
      typeof createVerifier({
        keys,
        issuer: ["https://a.example"],
        audience: "api",
        type: "JWT",
        clockTolerance: 300,
        maxAge: 1,
        maxLength: 65_536,
        requiredClaims: [],
        claims: schema as never,
        now: () => 0,
      }),
    ).toBe("function");
  });

  it("should accept a clockTolerance of 0 and a maxLength of 1", () => {
    expect(typeof createVerifier({ keys, clockTolerance: 0, maxLength: 1 })).toBe("function");
  });
});
