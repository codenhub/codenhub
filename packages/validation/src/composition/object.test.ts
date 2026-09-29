import { describe, expect, it } from "vitest";

import { fail, pass } from "../core/result";
import type { AsyncValidator } from "../core/types";
import { email } from "../formats/email";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { object } from "./object";
import { optional } from "./optional";

describe("object", () => {
  const user = object({ name: string({ min: 2 }), age: optional(number({ int: true })) });

  it("should validate each property and return a new object", () => {
    const input = { name: "Ada", age: 36 };
    const output = valueOf(user(input));
    expect(output).toEqual({ name: "Ada", age: 36 });
    expect(output).not.toBe(input);
  });

  it("should reject non-objects, arrays, null and class instances, naming the received type", () => {
    expect(accepts(user, null, undefined, 1, "x", [], new Date(), new (class Widget {})())).toEqual(
      Array(7).fill(false),
    );
    expect(issuesOf(user([]))[0]?.params).toEqual({ expected: "object", received: "array" });
    expect(issuesOf(user(new (class Widget {})()))[0]?.params).toEqual({ expected: "object", received: "Widget" });
  });

  it("should accept null-prototype objects", () => {
    expect(user(Object.assign(Object.create(null), { name: "Ada" })).ok).toBe(true);
  });

  it("should report a missing required property at its path", () => {
    expect(issuesOf(user({}))).toEqual([
      { code: "invalid_type", path: ["name"], params: { expected: "string", received: "undefined" } },
    ]);
  });

  it("should collect issues from every property, with nested paths", () => {
    const nested = object({ user: object({ email: email(), tags: object({ first: string({ min: 3 }) }) }) });
    const result = nested({ user: { email: "nope", tags: { first: "a" } } });
    expect(issuesOf(result).map((issue) => issue.path)).toEqual([
      ["user", "email"],
      ["user", "tags", "first"],
    ]);
  });

  it("should only read own properties", () => {
    const inherited = Object.create({ name: "Ada" }) as Record<string, unknown>;
    expect(user(inherited).ok).toBe(false);
  });

  it("should omit an optional property that is absent, and keep one that is present as undefined", () => {
    expect(valueOf(user({ name: "Ada" }))).not.toHaveProperty("age");
    expect(valueOf(user({ name: "Ada", age: undefined }))).toHaveProperty("age", undefined);
  });

  it("should not modify the input", () => {
    const input = { name: "Ada", extra: 1 };
    user(input);
    expect(input).toEqual({ name: "Ada", extra: 1 });
  });

  describe("unknown keys", () => {
    const input = { name: "Ada", extra: 1, other: 2 };

    it("should strip them by default", () => {
      expect(valueOf(user(input))).toEqual({ name: "Ada" });
    });

    it("should reject them in strict mode, one issue per key at the key's path", () => {
      const strict = object({ name: string() }, { unknownKeys: "strict" });
      expect(issuesOf(strict(input))).toEqual([
        { code: "unrecognized_key", path: ["extra"], params: { key: "extra" } },
        { code: "unrecognized_key", path: ["other"], params: { key: "other" } },
      ]);
    });

    it("should report unknown keys before property issues", () => {
      const strict = object({ name: string() }, { unknownKeys: "strict" });
      expect(codesOf(strict({ extra: 1 }))).toEqual(["unrecognized_key", "invalid_type"]);
    });

    it("should copy them without validating in passthrough mode", () => {
      const passthrough = object({ name: string() }, { unknownKeys: "passthrough" });
      expect(valueOf(passthrough(input))).toEqual(input);
    });

    it("should treat __proto__ from JSON as data, never as a prototype write", () => {
      const passthrough = object({ name: string() }, { unknownKeys: "passthrough" });
      const parsed = JSON.parse('{"name":"Ada","__proto__":{"admin":true}}') as unknown;
      const output = valueOf(passthrough(parsed));
      expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
      expect((output as { admin?: boolean }).admin).toBeUndefined();
      expect(Object.keys(output)).toEqual(["name", "__proto__"]);
    });
  });

  it("should accept an empty shape and strip everything", () => {
    expect(valueOf(object({})({ a: 1 }))).toEqual({});
  });

  describe("async properties", () => {
    const isFree: AsyncValidator<string> = async (input) =>
      input === "taken" ? fail({ code: "username_taken" }) : pass(input as string);

    it("should validate asynchronous properties and every other one together", async () => {
      const signup = object({ username: isFree, email: email() });
      const result = await signup({ username: "taken", email: "nope" });
      expect(issuesOf(result).map((issue) => [issue.path, issue.code])).toEqual([
        [["username"], "username_taken"],
        [["email"], "invalid_format"],
      ]);
    });

    it("should keep issue order independent of which promise settles first", async () => {
      const slow: AsyncValidator<string> = async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return fail({ code: "slow" });
      };
      const fast: AsyncValidator<string> = async () => fail({ code: "fast" });
      const result = await object({ a: slow, b: fast })({});
      expect(codesOf(result)).toEqual(["slow", "fast"]);
    });

    it("should answer at once for input it can reject without running the async property", () => {
      const signup = object({ username: isFree });
      const result = signup(null);
      expect("then" in result).toBe(false);
    });

    it("should stay synchronous when every property is", () => {
      expect("then" in user({ name: "Ada" })).toBe(false);
    });

    it("should return the validated value once the promises resolve", async () => {
      const result = await object({ username: isFree })({ username: "ada" });
      expect(valueOf(result)).toEqual({ username: "ada" });
    });
  });
});
