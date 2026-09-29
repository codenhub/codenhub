import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { accepts, codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { map } from "./map";

describe("map", () => {
  const stock = map(string({ min: 1 }), number({ int: true, min: 0 }));

  it("should validate every key and value and return a new Map", () => {
    const input = new Map([["apples", 3]]);
    const output = valueOf(stock(input));
    expect(output).toEqual(new Map([["apples", 3]]));
    expect(output).not.toBe(input);
  });

  it("should reject anything that is not a Map, including plain objects", () => {
    expect(accepts(stock, { apples: 3 }, [["a", 1]], null, new Set())).toEqual([false, false, false, false]);
    expect(issuesOf(stock({}))[0]?.params).toEqual({ expected: "map", received: "object" });
  });

  it("should report issues at the entry's key when it is a string or a number", () => {
    expect(issuesOf(stock(new Map([["apples", -1]]))).map((issue) => issue.path)).toEqual([["apples"]]);
    expect(issuesOf(map(number(), string())(new Map([[7, 1]]))).map((issue) => issue.path)).toEqual([[7]]);
  });

  it("should fall back to the position for keys that are neither", () => {
    const objectKeys = map(number(), number());
    const result = objectKeys(new Map<unknown, unknown>([[{}, 1]]));
    expect(issuesOf(result).map((issue) => issue.path)).toEqual([[0]]);
  });

  it("should report a bad key and a bad value separately", () => {
    expect(codesOf(stock(new Map([["", -1]])))).toEqual(["too_small", "too_small"]);
  });

  it("should treat min and max as inclusive and length as exact", () => {
    expect(accepts(map(string(), number(), { min: 1 }), new Map(), new Map([["a", 1]]))).toEqual([false, true]);
    expect(accepts(map(string(), number(), { max: 0 }), new Map(), new Map([["a", 1]]))).toEqual([true, false]);
    expect(issuesOf(map(string(), number(), { length: 2 })(new Map()))[0]?.params).toEqual({
      minimum: 2,
      exact: true,
      type: "map",
    });
  });

  it("should be asynchronous when a validator is", async () => {
    const result = map(isFree, number())(new Map([["taken", 1]]));
    expect(isPending(result)).toBe(true);
    expect(codesOf(await result)).toEqual(["taken"]);
  });
});
