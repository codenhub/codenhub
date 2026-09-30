import { describe, expect, it } from "vitest";

import { coerceBigint } from "../coercion/coerce-bigint";
import { coerceBoolean } from "../coercion/coerce-boolean";
import { coerceDate } from "../coercion/coerce-date";
import { coerceNumber } from "../coercion/coerce-number";
import { coerceString } from "../coercion/coerce-string";
import type { Check, MessageOptions, ValidationResult } from "../core/types";
import { accepts, issuesOf, isPending } from "../test-utils";
import { bigint } from "./bigint";
import { boolean } from "./boolean";
import { date } from "./date";
import { func } from "./func";
import { instanceOf } from "./instance-of";
import { literal } from "./literal";
import { never } from "./never";
import { number } from "./number";
import { oneOf } from "./one-of";
import { string } from "./string";
import { symbol } from "./symbol";
import { unknown } from "./unknown";

type Leaf = (
  ...args: [MessageOptions?, ...Check<never>[]] | Check<never>[]
) => (input: unknown) => ValidationResult<unknown>;

class Widget {}
const id = Symbol("id");
const noop = (): void => undefined;

/** Each leaf, a value it accepts and one it rejects. */
const leaves: [name: string, factory: Leaf, good: unknown, bad: unknown][] = [
  ["string", string as Leaf, "a", 1],
  ["number", number as Leaf, 1, "1"],
  ["bigint", bigint as Leaf, 1n, 1],
  ["boolean", boolean as Leaf, true, 1],
  ["date", date as Leaf, new Date(0), "x"],
  ["symbol", symbol as Leaf, id, "id"],
  ["unknown", unknown as Leaf, "anything", undefined],
  ["func", func as Leaf, noop, "noop"],
  ["literal", ((...rest: never[]) => literal("a", ...rest)) as Leaf, "a", "b"],
  ["oneOf", ((...rest: never[]) => oneOf(["a", "b"], ...rest)) as Leaf, "b", "c"],
  ["instanceOf", ((...rest: never[]) => instanceOf(Widget, ...rest)) as Leaf, new Widget(), {}],
  ["coerceString", coerceString as Leaf, 1, {}],
  ["coerceNumber", coerceNumber as Leaf, "1", "x"],
  ["coerceBigint", coerceBigint as Leaf, "1", "x"],
  ["coerceBoolean", coerceBoolean as Leaf, "yes", "maybe"],
  ["coerceDate", coerceDate as Leaf, "2024-01-01", "x"],
];

describe.each(leaves)("%s", (_name, factory, good) => {
  const refuse: Check<never> = () => [{ code: "refused", path: [] }];

  it("should accept a value of its kind with no arguments", () => {
    expect(factory()(good).ok).toBe(true);
  });

  it("should run checks, with or without options", () => {
    expect(issuesOf(factory(refuse)(good)).map((issue) => issue.code)).toEqual(["refused"]);
    expect(issuesOf(factory({}, refuse)(good)).map((issue) => issue.code)).toEqual(["refused"]);
  });

  it("should turn asynchronous with an asynchronous check, and only then", async () => {
    expect(isPending(factory(refuse)(good))).toBe(false);
    const later = (async () => undefined) as unknown as Check<never>;
    const pending = factory(later)(good);
    expect(isPending(pending)).toBe(true);
    expect((await pending).ok).toBe(true);
  });

  it("should refuse a check that is not a function when it is created", () => {
    expect(() => factory({}, "x" as unknown as Check<never>)).toThrow(TypeError);
  });
});

/** The leaves that reject something, which is every one but `unknown`. */
const rejecting = leaves.filter(([name]) => name !== "unknown");

describe.each(rejecting)("%s, given a value it rejects", (_name, factory, _good, bad) => {
  const refuse: Check<never> = () => [{ code: "refused", path: [] }];

  it("should word its own issue with the message option", () => {
    expect(issuesOf(factory({ message: "Nope" })(bad)).map((issue) => issue.message)).toEqual(["Nope"]);
    expect(issuesOf(factory({ message: (issue) => `Nope: ${issue.code}` })(bad))[0]?.message).toMatch(/^Nope: /);
  });

  it("should run no check, since the value is not of its kind", () => {
    expect(issuesOf(factory(refuse)(bad)).map((issue) => issue.code)).not.toContain("refused");
  });
});

describe("never", () => {
  it("should reject every value, worded by its message", () => {
    expect(accepts(never(), undefined, null, 0)).toEqual([false, false, false]);
    expect(issuesOf(never({ message: "Must be absent" })(1))[0]?.message).toBe("Must be absent");
  });
});

describe("symbol", () => {
  it("should accept symbols only, as they are", () => {
    expect(symbol()(id)).toEqual({ ok: true, value: id });
    expect(issuesOf(symbol()("id"))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "symbol", received: "string" } },
    ]);
  });
});

describe("literal and oneOf", () => {
  it("should report a fresh list of options on every failure", () => {
    const role = oneOf(["a", "b"]);
    const first = issuesOf(role("c"))[0]?.params?.options as string[];
    first.push("c");
    expect(issuesOf(role("c"))[0]?.params).toEqual({ options: ["a", "b"] });
    expect(role("c").ok).toBe(false);
  });

  it("should report invalid_value, not the type", () => {
    expect(issuesOf(literal("a")(1))).toEqual([{ code: "invalid_value", path: [], params: { expected: "a" } }]);
  });
});
