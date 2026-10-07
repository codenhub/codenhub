import { describe, expect, it } from "vitest";

import { array } from "../composition/array";
import { object } from "../composition/object";
import { objectLike } from "../composition/object-like";
import { optional } from "../composition/optional";
import { pick } from "../composition/pick";
import { describe as describeCheck } from "../core/describe";
import { toJsonSchema } from "../interop/json-schema";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { isPending, issuesOf, valueOf } from "../test-utils";
import { check } from "./check";
import { checkFields } from "./check-fields";

const MATCH = { path: ["confirm"], message: "Passwords must match" } as const;

const signup = object(
  { name: string({ min: 2 }), password: string({ min: 8 }), confirm: string() },
  checkFields(["password", "confirm"], (data) => data.password === data.confirm, MATCH),
);

describe("checkFields", () => {
  it("should run while another property fails, and report after the properties' own issues", () => {
    expect(issuesOf(signup({ name: "", password: "long enough", confirm: "nope" }))).toEqual([
      { code: "too_small", path: ["name"], params: { minimum: 2, type: "string" } },
      { code: "custom", path: ["confirm"], message: "Passwords must match" },
    ]);
  });

  it("should not run while a property it names fails", () => {
    const issues = issuesOf(signup({ name: "Ada", password: "short", confirm: "nope" }));
    expect(issues.map((issue) => issue.path)).toEqual([["password"]]);
  });

  it("should run as any check does once every property has passed", () => {
    expect(issuesOf(signup({ name: "Ada", password: "long enough", confirm: "nope" }))).toEqual([
      { code: "custom", path: ["confirm"], message: "Passwords must match" },
    ]);
    const valid = { name: "Ada", password: "long enough", confirm: "long enough" };
    expect(valueOf(signup(valid))).toEqual(valid);
  });

  it("should give the test the named properties alone", () => {
    const seen: unknown[] = [];
    const form = object(
      { a: string(), b: optional(number()), c: string(), ["__proto__"]: optional(string()) },
      checkFields(["a", "b", "__proto__"], (data) => {
        seen.push(data, Object.keys(data), Object.getPrototypeOf(data));
        return true;
      }),
    );
    form({ a: "x", c: 1 });
    expect(seen).toEqual([{ a: "x" }, ["a"], Object.prototype]);
    seen.length = 0;
    form(JSON.parse('{"a":"x","b":2,"c":"y","__proto__":"z"}'));
    expect(seen[1]).toEqual(["a", "b", "__proto__"]);
  });

  it("should leave a check made by check waiting for every property, beside one that does not wait", () => {
    const form = object(
      { a: string(), b: string(), c: string() },
      check(() => false, "Whole"),
      checkFields(["a", "b"], () => false, "Fields"),
    );
    expect(issuesOf(form({ a: "x", b: "y", c: 1 })).map((issue) => issue.message ?? issue.code)).toEqual([
      "invalid_type",
      "Fields",
    ]);
    expect(issuesOf(form({ a: "x", b: "y", c: "z" })).map((issue) => issue.message)).toEqual(["Whole", "Fields"]);
  });

  it("should take the issue as check does, and the object's message when it has none of its own", () => {
    const withCode = object(
      { from: number(), to: number() },
      { message: "Bad range" },
      checkFields(["from", "to"], (range) => range.from <= range.to, { code: "inverted", params: { field: "to" } }),
    );
    expect(issuesOf(withCode({ from: 2, to: 1 }))).toEqual([
      { code: "inverted", path: [], params: { field: "to" }, message: "Bad range" },
    ]);
    const worded = object(
      { from: number() },
      checkFields(
        ["from"],
        () => false,
        (issue) => `Failed with ${issue.code}`,
      ),
    );
    expect(issuesOf(worded({ from: 1 }))[0]?.message).toBe("Failed with custom");
  });

  it("should report at the place of the object it checks, inside another", () => {
    const list = array(
      object(
        { a: number(), b: number(), c: string() },
        checkFields(["a", "b"], (row) => row.a < row.b, { path: ["b"] }),
      ),
    );
    expect(
      issuesOf(
        list([
          { a: 1, b: 2, c: "x" },
          { a: 2, b: 1, c: 0 },
        ]),
      ).map((issue) => issue.path),
    ).toEqual([
      [1, "c"],
      [1, "b"],
    ]);
  });

  it("should wait for a test that waits, and keep the object synchronous otherwise", async () => {
    const taken = object(
      { name: string(), email: string(), age: number() },
      checkFields(["name", "email"], async (data) => {
        await Promise.resolve();
        return data.name !== data.email;
      }),
    );
    const result = taken({ name: "a", email: "a", age: "x" });
    expect(isPending(result)).toBe(true);
    expect(issuesOf(await result).map((issue) => issue.code)).toEqual(["invalid_type", "custom"]);
    expect(isPending(taken({ name: 1, email: "a", age: "x" }))).toBe(false);
    expect(isPending(signup({ name: "", password: "long enough", confirm: "nope" }))).toBe(false);
  });

  it("should work on objectLike, and count a property that could not be read as one that failed", () => {
    const view = objectLike(
      { width: number(), height: number(), title: string() },
      checkFields(["width", "height"], (size) => size.width >= size.height, "Too tall"),
    );
    class View {
      width = 1;
      height = 2;
      title = 0;
    }
    expect(issuesOf(view(new View())).map((issue) => issue.message ?? issue.code)).toEqual([
      "invalid_type",
      "Too tall",
    ]);
    const broken = {
      width: 1,
      title: 0,
      get height(): number {
        throw new Error("no");
      },
    };
    expect(issuesOf(view(broken)).map((issue) => issue.code)).toEqual(["invalid_value", "invalid_type"]);
  });

  it("should refuse a property the object does not have when the object is made, and bad arguments at once", () => {
    const misspelled = checkFields<{ a: string }, "a">(["b" as "a"], () => true);
    expect(() => object({ a: string() }, misspelled)).toThrow(
      "checkFields() names a property the object does not have: b",
    );
    expect(() => objectLike({ a: string() }, misspelled)).toThrow("does not have: b");
    expect(() => checkFields("a" as never, () => true)).toThrow(
      "keys must be a list of property names, received string",
    );
    expect(() => checkFields([1 as never], () => true)).toThrow("checkFields() needs a list of property names");
    expect(() => checkFields([], () => true)).toThrow("checkFields() needs at least one property name");
    expect(() => checkFields(["a"] as never, "nope" as never)).toThrow(TypeError);
    expect(() => checkFields(["a"] as never, () => true, 5 as never)).toThrow("issue must be a message or an issue");
  });

  it("should read the list of properties once, when the check is made", () => {
    const keys: ("a" | "b")[] = ["a"];
    const only = checkFields<{ a: string; b: string }, "a" | "b">(keys, () => false);
    keys.push("b");
    expect(describeCheck(only)).toEqual({ kind: "check", fields: ["a"] });
    expect(issuesOf(object({ a: string(), b: string() }, only)({ a: "x", b: 1 })).map((issue) => issue.code)).toEqual([
      "invalid_type",
      "custom",
    ]);
  });

  it("should be a check that cannot be read to what reads a schema, and one more check to pick", () => {
    expect(() => toJsonSchema(signup)).toThrow("a check that cannot be read at the root");
    expect(() => pick(signup, ["name"])).toThrow("pick() cannot keep the checks of an object");
  });

  it("should be an ordinary check on any other validator", () => {
    const pair = checkFields<{ a: number; b: number }, "a">(["a"], (value) => value.a > 0, "Positive");
    expect(pair({ a: 0, b: 1 })).toEqual([{ code: "custom", path: [], message: "Positive" }]);
    expect(pair({ a: 1, b: 1 })).toBeUndefined();
  });
});
