import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { coerceNumber } from "../coercion/coerce-number";
import { describe as describeValidator } from "../core/describe";
import type { Validator } from "../core/types";
import { datetime } from "../formats/datetime";
import { email } from "../formats/email";
import { searchParams } from "../formats/search-params";
import { bigint } from "../primitives/bigint";
import { date } from "../primitives/date";
import { literal } from "../primitives/literal";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { codec } from "./codec";
import { encode } from "./encode";
import { fallback } from "./fallback";
import { json } from "./json";
import { lazy } from "./lazy";
import { map } from "./map";
import { meta } from "./meta";
import { nullable } from "./nullable";
import { object } from "./object";
import { optional } from "./optional";
import { pipe } from "./pipe";
import { readonly } from "./readonly";
import { record } from "./record";
import { set } from "./set";
import { tagged } from "./tagged";
import { transform } from "./transform";
import { tuple } from "./tuple";
import { union } from "./union";

const isoDate = codec(datetime(), date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});
const decimal = codec(string(), bigint(), {
  decode: (text) => BigInt(text),
  encode: (value) => value.toString(),
});
const moment = new Date("2026-10-07T12:00:00.000Z");

describe("codec", () => {
  it("should validate with the input, decode, and validate what it decoded with the output", () => {
    expect(valueOf(isoDate("2026-10-07T12:00:00.000Z"))).toEqual(moment);
    expect(codesOf(isoDate("yesterday"))).toEqual(["invalid_format"]);
    const positive = codec(string(), number({ min: 1 }), { decode: Number, encode: String });
    expect(issuesOf(positive("0"))).toEqual([
      { code: "too_small", path: [], params: { minimum: 1, type: "number", inclusive: true } },
    ]);
  });

  it("should report what fails inside an object at its full path", () => {
    expect(issuesOf(object({ when: isoDate })({ when: 1 }))[0]?.path).toEqual(["when"]);
    expect(issuesOf(array(decimal)(["1", 2]))[0]?.path).toEqual([1]);
  });

  it("should describe its input, its output and both functions", () => {
    expect(describeValidator(isoDate)).toMatchObject({ kind: "codec" });
    const record = describeValidator(isoDate) as Record<string, unknown>;
    expect(Object.keys(record).toSorted()).toEqual(["decode", "encode", "input", "kind", "output"]);
  });

  it("should refuse what is not a function", () => {
    expect(() => codec(string(), date(), { decode: undefined, encode: String } as never)).toThrow(TypeError);
    expect(() => codec(string(), date(), undefined as never)).toThrow(TypeError);
    expect(() => codec(undefined as never, date(), { decode: String, encode: String } as never)).toThrow(TypeError);
  });
});

describe("encode", () => {
  it("should write a value back through a codec, and check it is one the validator could produce", () => {
    expect(valueOf(encode(isoDate, moment))).toBe("2026-10-07T12:00:00.000Z");
    expect(codesOf(encode(isoDate, new Date(Number.NaN)))).toEqual(["invalid_type"]);
  });

  it("should write back every composer around a codec", () => {
    const event = object({
      at: isoDate,
      amounts: array(decimal),
      pair: tuple([decimal], { rest: isoDate }),
      ids: set(decimal),
      totals: record(string(), decimal),
      byDay: map(isoDate, decimal),
      note: optional(string()),
      parent: nullable(decimal),
      either: union([decimal, string()]),
      frozen: readonly(array(decimal)),
      safe: fallback(decimal, 0n),
      wrapped: meta(decimal, { title: "Amount" }),
    });
    expect(
      valueOf(
        encode(event, {
          at: moment,
          amounts: [1n, 2n],
          pair: [3n, moment],
          ids: new Set([4n]),
          totals: { a: 5n },
          byDay: new Map([[moment, 6n]]),
          parent: null,
          either: 7n,
          frozen: [8n],
          safe: 9n,
          wrapped: 10n,
        }),
      ),
    ).toEqual({
      at: "2026-10-07T12:00:00.000Z",
      amounts: ["1", "2"],
      pair: ["3", "2026-10-07T12:00:00.000Z"],
      ids: new Set(["4"]),
      totals: { a: "5" },
      byDay: new Map([["2026-10-07T12:00:00.000Z", "6"]]),
      parent: null,
      either: "7",
      frozen: ["8"],
      safe: "9",
      wrapped: "10",
    });
  });

  it("should give back what validating gives for a part that produces what it accepts", () => {
    expect(
      valueOf(encode(object({ email: email(), count: coerceNumber() }), { email: "Ada@EXAMPLE.com", count: 2 })),
    ).toEqual({
      email: "Ada@example.com",
      count: 2,
    });
    expect(codesOf(encode(number({ min: 1 }), 0))).toEqual(["too_small"]);
  });

  it("should write the steps of a pipe back in reverse", () => {
    const stamp = pipe(string({ max: 40 }), isoDate);
    expect(valueOf(encode(stamp, moment))).toBe("2026-10-07T12:00:00.000Z");
  });

  it("should write the text json and searchParams read", () => {
    expect(valueOf(encode(json(object({ at: isoDate })), { at: moment }))).toBe('{"at":"2026-10-07T12:00:00.000Z"}');
    expect(valueOf(encode(json(), { a: 1 }))).toBe('{"a":1}');
    const query = searchParams(object({ page: coerceNumber(), tag: optional(string()) }));
    expect(valueOf(encode(query, { page: 2 }))).toBe("page=2");
    const tags = searchParams(object({ tag: array(string()) }), { repeated: true });
    expect(valueOf(encode(tags, { tag: ["a b", "c"] }))).toBe("tag=a+b&tag=c");
  });

  it("should write back a tagged union and a recursive schema", () => {
    const shape = tagged("type", { dated: object({ at: isoDate }), plain: object({}) });
    expect(valueOf(encode(shape, { type: "dated", at: moment }))).toEqual({
      type: "dated",
      at: "2026-10-07T12:00:00.000Z",
    });
    type Tree = { at: Date; children: Tree[] };
    const tree: Validator<Tree> = lazy(() => object({ at: isoDate, children: array(tree) }));
    expect(valueOf(encode(tree, { at: moment, children: [{ at: moment, children: [] }] }))).toEqual({
      at: "2026-10-07T12:00:00.000Z",
      children: [{ at: "2026-10-07T12:00:00.000Z", children: [] }],
    });
  });

  it("should run the checks of a part on the value once its structure passes", () => {
    const range = object(
      { from: isoDate, to: isoDate },
      check((value) => value.from <= value.to, "From must come first"),
    );
    expect(issuesOf(encode(range, { from: moment, to: new Date(0) }))[0]?.message).toBe("From must come first");
    expect(codesOf(encode(range, { from: moment, to: "now" } as never))).toEqual(["invalid_type"]);
  });

  it("should report what fails at its path, and refuse what the validator could not produce", () => {
    expect(issuesOf(encode(object({ at: isoDate }), { at: "now" } as never))[0]?.path).toEqual(["at"]);
    expect(codesOf(encode(literal("a"), "b" as never))).toEqual(["invalid_value"]);
  });

  it("should wait for an asynchronous part, and stay synchronous otherwise", async () => {
    expect(isPending(encode(object({ at: isoDate }), { at: moment }))).toBe(false);
    const free = string(check(async (handle: string) => handle !== "taken", { code: "taken" }));
    const result = encode(object({ handle: free }), { handle: "taken" });
    expect(isPending(result)).toBe(true);
    expect(codesOf(await result)).toEqual(["taken"]);
  });

  it("should throw for a part that cannot be written back, naming its place", () => {
    const byHand: Validator<string> = (input) => ({ ok: true, value: String(input) });
    expect(() => encode(object({ size: transform(string(), (text) => text.length) }), { size: 1 })).toThrow(
      new TypeError("encode cannot write back a transform at size. Use a codec there"),
    );
    expect(() => encode(array(byHand), ["a"])).toThrow(
      new TypeError("encode cannot write back a validator written by hand at []. Use a codec there"),
    );
    expect(() => encode(undefined as never, 1)).toThrow(TypeError);
  });
});
