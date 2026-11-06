import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { fail, pass } from "../core/result";
import type { AsyncValidator, Validator } from "../core/types";
import { email } from "../formats/email";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { object } from "./object";
import { optional } from "./optional";

describe("object", () => {
  const user = object({ name: string({ min: 2 }), age: optional(number({ int: true })) });

  it("should read a listed key that is not enumerable, and leave out unlisted ones and symbols whatever unknownKeys", () => {
    const input = Object.defineProperty({ [Symbol.for("extra")]: 1 }, "name", { value: "Ada", enumerable: false });
    Object.defineProperty(input, "hidden", { value: 1, enumerable: false });
    expect(valueOf(object({ name: string() })(input))).toEqual({ name: "Ada" });
    expect(object({ name: string() }, { unknownKeys: "strict" })(input).ok).toBe(true);
    const kept = valueOf(object({ name: string() }, { unknownKeys: "passthrough" })(input)) as object;
    expect(Reflect.ownKeys(kept)).toEqual(["name"]);
  });

  it("should read each validator of the shape once, so the one it checked is the one it runs", () => {
    let reads = 0;
    const shape = {
      get name() {
        reads += 1;
        return reads === 1 ? string() : (undefined as never);
      },
    };
    expect(object(shape)({ name: "Ada" }).ok).toBe(true);
    expect(reads).toBe(1);
  });

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
    expect(issuesOf(user(new (class Widget {})()))[0]?.params).toEqual({
      expected: "object",
      received: "non-plain object",
    });
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

    it("should reject an unknown mode when the validator is created, rather than strip", () => {
      expect(() => object({}, { unknownKeys: "Strict" as "strict" })).toThrow(TypeError);
      expect(() => object({}, { unknownKeys: undefined })).not.toThrow();
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

    it("should refuse an unlisted __proto__ key in passthrough mode, which a copy by assignment would read as a prototype", () => {
      const passthrough = object({ name: string() }, { unknownKeys: "passthrough" });
      const parsed = JSON.parse('{"name":"Ada","__proto__":{"admin":true}}') as unknown;
      expect(issuesOf(passthrough(parsed))).toEqual([
        {
          code: "invalid_key",
          path: ["__proto__"],
          params: { issues: [{ code: "invalid_value", path: [], params: { reserved: true } }] },
        },
      ]);
    });

    it("should report an unlisted __proto__ key in passthrough mode beside the issues of the properties", () => {
      const passthrough = object({ name: string() }, { unknownKeys: "passthrough" });
      const parsed = JSON.parse('{"name":1,"__proto__":{"admin":true}}') as unknown;
      expect(codesOf(passthrough(parsed))).toEqual(["invalid_key", "invalid_type"]);
    });

    it("should drop an unlisted __proto__ key in strip mode, as any other", () => {
      const parsed = JSON.parse('{"name":"Ada","__proto__":{"admin":true}}') as unknown;
      expect(Object.keys(valueOf(object({ name: string() })(parsed)))).toEqual(["name"]);
    });

    it("should keep a __proto__ key the shape lists as data, never as a prototype write", () => {
      const listed = object({ ["__proto__"]: string() }, { unknownKeys: "passthrough" });
      const output = valueOf(listed(JSON.parse('{"__proto__":"a"}')));
      expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
      expect(Object.keys(output)).toEqual(["__proto__"]);
    });

    it("should keep a key Object.prototype holds as a setter or read-only as data of the output", () => {
      const written: unknown[] = [];
      Object.defineProperty(Object.prototype, "trapped", {
        set: (value) => {
          written.push(value);
        },
        configurable: true,
      });
      Object.defineProperty(Object.prototype, "locked", { value: "inherited", writable: false, configurable: true });
      try {
        const user = object({ trapped: string(), locked: string(), toString: string() });
        const output = valueOf(user({ trapped: "a", locked: "b", toString: "c" }));
        expect(written).toEqual([]);
        expect(Object.entries(output)).toEqual([
          ["trapped", "a"],
          ["locked", "b"],
          ["toString", "c"],
        ]);
      } finally {
        delete (Object.prototype as Record<string, unknown>)["trapped"];
        delete (Object.prototype as Record<string, unknown>)["locked"];
      }
    });
  });

  describe("unknown keys given to a validator", () => {
    const counts = object({ name: string() }, { unknownKeys: number() });

    it("should validate each key the shape does not list with it, and keep what it produces", () => {
      const trimmed = object({ name: string() }, { unknownKeys: string({ trim: true }) });
      expect(valueOf(trimmed({ name: " Ada ", city: " Paris ", country: "France" }))).toEqual({
        name: " Ada ",
        city: "Paris",
        country: "France",
      });
    });

    it("should not give it the keys the shape lists", () => {
      expect(valueOf(counts({ name: "Ada" }))).toEqual({ name: "Ada" });
    });

    it("should report what it finds at the key, after the issues of the listed properties", () => {
      expect(issuesOf(counts({ b: "x", name: 1, a: 2, c: "y" }))).toEqual([
        { code: "invalid_type", path: ["name"], params: { expected: "string", received: "number" } },
        { code: "invalid_type", path: ["b"], params: { expected: "number", received: "string" } },
        { code: "invalid_type", path: ["c"], params: { expected: "number", received: "string" } },
      ]);
    });

    it("should put the listed properties first in the output, then the others in the order of the input", () => {
      expect(Object.keys(valueOf(counts({ b: 1, name: "Ada", a: 2 })))).toEqual(["name", "b", "a"]);
    });

    it("should leave out unlisted keys that are symbols or not enumerable, as passthrough does", () => {
      const input = Object.defineProperty({ [Symbol.for("extra")]: "x", name: "Ada" }, "hidden", {
        value: "x",
        enumerable: false,
      });
      expect(Reflect.ownKeys(valueOf(counts(input)))).toEqual(["name"]);
    });

    it("should refuse an unlisted __proto__ key, as record does, and still validate its value", () => {
      const parsed = JSON.parse('{"name":"Ada","__proto__":{"admin":true}}') as unknown;
      const reserved = {
        code: "invalid_key",
        path: ["__proto__"],
        params: { issues: [{ code: "invalid_value", path: [], params: { reserved: true } }] },
      };
      expect(issuesOf(object({ name: string() }, { unknownKeys: unknown() })(parsed))).toEqual([reserved]);
      expect(issuesOf(counts(parsed))).toEqual([
        { code: "invalid_type", path: ["__proto__"], params: { expected: "number", received: "object" } },
        reserved,
      ]);
    });

    it("should keep keys Object.prototype holds as data of the output, never as its prototype or a setter", () => {
      const written: unknown[] = [];
      Object.defineProperty(Object.prototype, "trapped", {
        set: (value) => {
          written.push(value);
        },
        configurable: true,
      });
      try {
        const output = valueOf(counts({ name: "Ada", constructor: 1, toString: 2, hasOwnProperty: 3, trapped: 4 }));
        expect(written).toEqual([]);
        expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
        expect(Object.entries(output)).toEqual([
          ["name", "Ada"],
          ["constructor", 1],
          ["toString", 2],
          ["hasOwnProperty", 3],
          ["trapped", 4],
        ]);
      } finally {
        delete (Object.prototype as Record<string, unknown>)["trapped"];
      }
    });

    it("should run the checks of the object on the output, unlisted keys included", () => {
      const total = object(
        { name: string() },
        { unknownKeys: number() },
        check((data: Record<string, unknown>) => Object.keys(data).length <= 2, { code: "too_many" }),
      );
      expect(total({ name: "Ada", a: 1 }).ok).toBe(true);
      expect(codesOf(total({ name: "Ada", a: 1, b: 2 }))).toEqual(["too_many"]);
    });

    it("should reject what is neither a mode nor a function when the validator is created", () => {
      expect(() => object({}, { unknownKeys: 1 as never })).toThrow(
        'unknownKeys must be "strip", "strict", "passthrough" or a validator, received "1"',
      );
    });

    it("should read every unlisted value before the validator can change the input", () => {
      const input: Record<string, unknown> = { name: "Ada", a: 1, b: 2 };
      const changing: Validator<number> = (value) => {
        input["b"] = "changed";
        input["c"] = 3;
        return pass(value as number);
      };
      expect(valueOf(object({ name: string() }, { unknownKeys: changing })(input))).toEqual({
        name: "Ada",
        a: 1,
        b: 2,
      });
    });
  });

  it("should read the shape once, when the validator is created", () => {
    const shape: Record<string, Validator<unknown>> = { name: string() };
    const user = object(shape, { unknownKeys: "strict" });
    shape["name"] = number();
    shape["age"] = number();
    expect(user({ name: "Ada" })).toEqual({ ok: true, value: { name: "Ada" } });
    expect(codesOf(user({ name: "Ada", age: 1 }))).toEqual(["unrecognized_key"]);
    delete shape["name"];
    expect(user({ name: "Ada" }).ok).toBe(true);
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

    it("should build its output from the input as it was when called, not after the wait", async () => {
      const passthrough = object({ username: isFree, nickname: optional(string()) }, { unknownKeys: "passthrough" });
      const input: Record<string, unknown> = { username: "ada", extra: "before" };
      const pending = passthrough(input);
      input["extra"] = "after";
      input["added"] = "later";
      input["nickname"] = undefined;
      expect(valueOf(await pending)).toEqual({ username: "ada", extra: "before" });
      expect(Object.hasOwn(valueOf(await pending), "nickname")).toBe(false);
    });

    it("should read the input before a property's validator can change it", async () => {
      const input: Record<string, unknown> = { username: "ada", nickname: "a", extra: "before" };
      const changing: Validator<string> = (value) => {
        input["extra"] = "after";
        input["nickname"] = 1;
        return pass(value as string);
      };
      const passthrough = object(
        { username: changing, nickname: string(), slow: optional(isFree) },
        { unknownKeys: "passthrough" },
      );
      expect(valueOf(await passthrough(input))).toEqual({ username: "ada", nickname: "a", extra: "before" });
    });

    it("should be asynchronous when the validator of unlisted keys is, and keep the order of the issues", async () => {
      const slow: AsyncValidator<string> = async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return input === "taken" ? fail({ code: "taken" }) : pass(input as string);
      };
      const handles = object({ name: string() }, { unknownKeys: slow });
      const pending = handles({ name: 1, a: "taken", b: "ada" });
      expect("then" in pending).toBe(true);
      expect(issuesOf(await pending).map((issue) => [issue.path, issue.code])).toEqual([
        [["name"], "invalid_type"],
        [["a"], "taken"],
      ]);
      expect(valueOf(await handles({ name: "Ada", b: "ada" }))).toEqual({ name: "Ada", b: "ada" });
    });

    it("should stay synchronous when the validator of unlisted keys is and every property is", () => {
      expect("then" in object({ name: string() }, { unknownKeys: number() })({ name: "Ada", a: 1 })).toBe(false);
    });

    it("should return the validated value once the promises resolve", async () => {
      const result = await object({ username: isFree })({ username: "ada" });
      expect(valueOf(result)).toEqual({ username: "ada" });
    });
  });
});
