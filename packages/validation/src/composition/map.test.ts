import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
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

  it("should report issues at the entry's key when it is a string", () => {
    expect(issuesOf(stock(new Map([["apples", -1]]))).map((issue) => issue.path)).toEqual([["apples"]]);
  });

  it("should report issues at the entry's position for any other key, so no two entries share a path", () => {
    expect(issuesOf(map(number(), string())(new Map([[7, 1]]))).map((issue) => issue.path)).toEqual([[0]]);
    const mixed = map(
      unknown(),
      string(),
    )(
      new Map<unknown, unknown>([
        [{}, 1],
        [0, 2],
        ["0", 3],
      ]),
    );
    expect(issuesOf(mixed).map((issue) => issue.path)).toEqual([[0], [1], ["0"]]);
  });

  it("should report a bad key as invalid_key holding the key's issues, and a bad value as itself", () => {
    const [keyIssue, valueIssue] = issuesOf(stock(new Map([["", -1]])));
    expect(keyIssue).toEqual({
      code: "invalid_key",
      path: [""],
      params: { issues: [{ code: "too_small", path: [], params: { minimum: 1, type: "string" } }] },
    });
    expect(valueIssue?.code).toBe("too_small");
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
    expect(codesOf(await result)).toEqual(["invalid_key"]);
  });

  it("should report a key that the key validator makes equal to an earlier one, instead of dropping a value", () => {
    const lowered = map(string({ lowercase: true }), number());
    const result = lowered(
      new Map([
        ["A", 1],
        ["a", 2],
      ]),
    );
    expect(issuesOf(result).map((issue) => [issue.code, issue.path])).toEqual([["invalid_key", ["a"]]]);
    expect(valueOf(lowered(new Map([["A", 1]])))).toEqual(new Map([["a", 1]]));
  });
});
