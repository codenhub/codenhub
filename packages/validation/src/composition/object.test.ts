import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { validator } from "../builders/validator";
import { fail, pass } from "../core/result";
import type { Validator } from "../core/types";
import { email } from "../formats/email";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { looseObject } from "./loose-object";
import { object } from "./object";
import { objectWithRest } from "./object-with-rest";
import { optional } from "./optional";
import { strictObject } from "./strict-object";

/** An asynchronous validator that accepts strings not equal to `taken`, failing others with `username_taken`. */
const isFree = validator(async (input) =>
  input === "taken" ? fail({ code: "username_taken" }) : pass(input as string),
);

/** The issue an unlisted `__proto__` key is refused with. */
const reserved = {
  code: "invalid_key",
  path: ["__proto__"],
  params: { issues: [{ code: "invalid_value", path: [], params: { reserved: true } }] },
};

describe("object", () => {
  const user = object({ name: string({ min: 2 }), age: optional(number({ int: true })) });

  it("should read a listed key that is not enumerable, and leave out unlisted ones and symbols however it treats unlisted keys", () => {
    const input = Object.defineProperty({ [Symbol.for("extra")]: 1 }, "name", { value: "Ada", enumerable: false });
    Object.defineProperty(input, "hidden", { value: 1, enumerable: false });
    expect(valueOf(object({ name: string() })(input))).toEqual({ name: "Ada" });
    expect(strictObject({ name: string() })(input).ok).toBe(true);
    const kept = valueOf(looseObject({ name: string() })(input)) as object;
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

  it("should refuse a property validator written by hand that validator() did not make", () => {
    const byHand = (input: unknown) => pass(input as string);
    expect(() => object({ name: byHand as never })).toThrow(
      new TypeError(
        "shape.name is not a validator of this copy of the package. A factory is called first, as in string(), and any other function is given to validator()",
      ),
    );
    expect(valueOf(object({ name: validator(byHand) })({ name: "Ada" }))).toEqual({ name: "Ada" });
  });

  describe("unlisted keys", () => {
    const input = { name: "Ada", extra: 1, other: 2 };

    it("should drop them", () => {
      expect(valueOf(user(input))).toEqual({ name: "Ada" });
    });

    it("should refuse the unknownKeys option, which strictObject, looseObject and objectWithRest replace", () => {
      expect(() => object({}, { unknownKeys: "strict" } as never)).toThrow(new TypeError("Unknown option unknownKeys"));
      expect(() => object({}, { unknownKeys: undefined } as never)).toThrow("Unknown option unknownKeys");
    });

    it("should drop an unlisted __proto__ key, as any other", () => {
      const parsed = JSON.parse('{"name":"Ada","__proto__":{"admin":true}}') as unknown;
      expect(Object.keys(valueOf(object({ name: string() })(parsed)))).toEqual(["name"]);
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

  it("should read the shape once, when the validator is created", () => {
    const shape: Record<string, Validator<unknown>> = { name: string() };
    const user = strictObject(shape);
    shape["name"] = number();
    shape["age"] = number();
    expect(user({ name: "Ada" })).toEqual({ ok: true, value: { name: "Ada" } });
    expect(codesOf(user({ name: "Ada", age: 1 }))).toEqual(["unrecognized_key"]);
    delete shape["name"];
    expect(user({ name: "Ada" }).ok).toBe(true);
  });

  it("should accept an empty shape and drop everything", () => {
    expect(valueOf(object({})({ a: 1 }))).toEqual({});
  });

  describe("async properties", () => {
    it("should validate asynchronous properties and every other one together", async () => {
      const signup = object({ username: isFree, email: email() });
      const result = await signup({ username: "taken", email: "nope" });
      expect(issuesOf(result).map((issue) => [issue.path, issue.code])).toEqual([
        [["username"], "username_taken"],
        [["email"], "invalid_format"],
      ]);
    });

    it("should keep issue order independent of which promise settles first", async () => {
      const slow = validator(async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return fail({ code: "slow" });
      });
      const fast = validator(async () => fail({ code: "fast" }));
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

    it("should read every listed property before anything waits, so a change made during a wait reaches neither a later validator nor the output", async () => {
      const input: Record<string, unknown> = { username: "ada", nickname: "a" };
      const seen: unknown[] = [];
      const changing = validator(async (value) => {
        // Past an await, so the change is made while the object waits and not while it reads.
        await Promise.resolve();
        input["username"] = "changed";
        input["nickname"] = 1;
        input["bio"] = "added";
        return pass(value as string);
      });
      const later = validator((value) => {
        seen.push(value);
        return typeof value === "string" ? pass(value) : fail({ code: "changed" });
      });
      const absent = validator((value) => {
        seen.push(value);
        return pass(value);
      });
      const account = object({ username: changing, nickname: later, bio: absent });
      const result = await account(input);
      expect(input).toEqual({ username: "changed", nickname: 1, bio: "added" });
      expect(seen).toEqual(["a", undefined]);
      expect(valueOf(result)).toEqual({ username: "ada", nickname: "a" });
      expect(Object.hasOwn(valueOf(result), "bio")).toBe(false);
    });

    it("should return the validated value once the promises resolve", async () => {
      const result = await object({ username: isFree })({ username: "ada" });
      expect(valueOf(result)).toEqual({ username: "ada" });
    });
  });
});

describe("strictObject", () => {
  const strict = strictObject({ name: string() });

  it("should accept an object that holds the listed properties and no other", () => {
    expect(valueOf(strict({ name: "Ada" }))).toEqual({ name: "Ada" });
  });

  it("should refuse the unlisted keys, one issue per key at the key's path", () => {
    expect(issuesOf(strict({ name: "Ada", extra: 1, other: 2 }))).toEqual([
      { code: "unrecognized_key", path: ["extra"], params: { key: "extra" } },
      { code: "unrecognized_key", path: ["other"], params: { key: "other" } },
    ]);
  });

  it("should report unlisted keys before property issues", () => {
    expect(codesOf(strict({ extra: 1 }))).toEqual(["unrecognized_key", "invalid_type"]);
  });

  it("should word its issues with the message option, and run its checks once nothing was refused", () => {
    const named = strictObject(
      { name: string() },
      { message: "Not that" },
      check((data) => data.name !== "nobody", { code: "nobody" }),
    );
    expect(issuesOf(named({ name: "Ada", extra: 1 })).map((issue) => issue.message)).toEqual(["Not that"]);
    expect(issuesOf(named(1)).map((issue) => issue.message)).toEqual(["Not that"]);
    expect(codesOf(named({ name: "nobody" }))).toEqual(["nobody"]);
    expect(codesOf(named({ name: "nobody", extra: 1 }))).toEqual(["unrecognized_key"]);
    expect(named({ name: "Ada" }).ok).toBe(true);
  });

  it("should be asynchronous when a property is, and still report the unlisted keys first", async () => {
    const signup = strictObject({ username: isFree });
    const pending = signup({ username: "taken", extra: 1 });
    expect("then" in pending).toBe(true);
    expect(codesOf(await pending)).toEqual(["unrecognized_key", "username_taken"]);
  });
});

describe("looseObject", () => {
  const input = { name: "Ada", extra: 1, other: 2 };
  const loose = looseObject({ name: string() });

  it("should copy the unlisted keys without validating them", () => {
    expect(valueOf(loose(input))).toEqual(input);
  });

  it("should put the listed properties first in the output, then the others in the order of the input", () => {
    expect(Object.keys(valueOf(loose({ b: 1, name: "Ada", a: 2 })))).toEqual(["name", "b", "a"]);
  });

  it("should refuse an unlisted __proto__ key, which a copy by assignment would read as a prototype", () => {
    const parsed = JSON.parse('{"name":"Ada","__proto__":{"admin":true}}') as unknown;
    expect(issuesOf(loose(parsed))).toEqual([reserved]);
  });

  it("should report an unlisted __proto__ key beside the issues of the properties", () => {
    const parsed = JSON.parse('{"name":1,"__proto__":{"admin":true}}') as unknown;
    expect(codesOf(loose(parsed))).toEqual(["invalid_key", "invalid_type"]);
  });

  it("should keep a __proto__ key the shape lists as data, never as a prototype write", () => {
    const listed = looseObject({ ["__proto__"]: string() });
    const output = valueOf(listed(JSON.parse('{"__proto__":"a"}')));
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.keys(output)).toEqual(["__proto__"]);
  });

  it("should word its issues with the message option, and run its checks on the output, unlisted keys included", () => {
    const sized = looseObject(
      { name: string() },
      { message: "Not that" },
      check((data: Record<string, unknown>) => Object.keys(data).length <= 2, { code: "too_many" }),
    );
    expect(issuesOf(sized(1)).map((issue) => issue.message)).toEqual(["Not that"]);
    const parsed = JSON.parse('{"name":"Ada","__proto__":{"admin":true}}') as unknown;
    expect(issuesOf(sized(parsed)).map((issue) => issue.message)).toEqual(["Not that"]);
    expect(sized({ name: "Ada", a: 1 }).ok).toBe(true);
    expect(codesOf(sized({ name: "Ada", a: 1, b: 2 }))).toEqual(["too_many"]);
  });

  it("should read the unlisted properties before the validator of a listed one runs, which then cannot change what is kept", () => {
    const changed: Record<string, unknown> = { username: "ada", extra: "before" };
    const changing = validator((value) => {
      changed["extra"] = "after";
      changed["added"] = "later";
      return pass(value as string);
    });
    expect(valueOf(looseObject({ username: changing })(changed))).toEqual({ username: "ada", extra: "before" });
    expect(changed).toEqual({ username: "ada", extra: "after", added: "later" });
  });

  it("should build its output from the input as it was when called, not after the wait", async () => {
    const account = looseObject({ username: isFree, nickname: optional(string()) });
    const waiting: Record<string, unknown> = { username: "ada", extra: "before" };
    const pending = account(waiting);
    waiting["extra"] = "after";
    waiting["added"] = "later";
    waiting["nickname"] = undefined;
    expect(valueOf(await pending)).toEqual({ username: "ada", extra: "before" });
    expect(Object.hasOwn(valueOf(await pending), "nickname")).toBe(false);
  });
});

describe("objectWithRest", () => {
  const counts = objectWithRest({ name: string() }, number());

  it("should validate each key the shape does not list with it, and keep what it produces", () => {
    const trimmed = objectWithRest({ name: string() }, string({ trim: true }));
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

  it("should leave out unlisted keys that are symbols or not enumerable, as looseObject does", () => {
    const input = Object.defineProperty({ [Symbol.for("extra")]: "x", name: "Ada" }, "hidden", {
      value: "x",
      enumerable: false,
    });
    expect(Reflect.ownKeys(valueOf(counts(input)))).toEqual(["name"]);
  });

  it("should refuse an unlisted __proto__ key, as record does, and still validate its value", () => {
    const parsed = JSON.parse('{"name":"Ada","__proto__":{"admin":true}}') as unknown;
    expect(issuesOf(objectWithRest({ name: string() }, unknown())(parsed))).toEqual([reserved]);
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
    const total = objectWithRest(
      { name: string() },
      number(),
      check((data: Record<string, unknown>) => Object.keys(data).length <= 2, { code: "too_many" }),
    );
    expect(total({ name: "Ada", a: 1 }).ok).toBe(true);
    expect(codesOf(total({ name: "Ada", a: 1, b: 2 }))).toEqual(["too_many"]);
  });

  it("should word its own issues with the message option, and leave those of the rest validator as they are", () => {
    const worded = objectWithRest({ name: string() }, number({ message: "Not a count" }), { message: "Not that" });
    expect(issuesOf(worded(1)).map((issue) => issue.message)).toEqual(["Not that"]);
    const parsed = JSON.parse('{"name":"Ada","a":"x","__proto__":1}') as unknown;
    expect(issuesOf(worded(parsed)).map((issue) => [issue.path, issue.message])).toEqual([
      [["a"], "Not a count"],
      [["__proto__"], "Not that"],
    ]);
  });

  it("should refuse a rest that is not a validator when it is created", () => {
    expect(() => objectWithRest({}, 1 as never)).toThrow(new TypeError("rest must be a function, received number"));
    expect(() => objectWithRest({}, undefined as never)).toThrow("rest must be a function, received undefined");
    expect(() => objectWithRest({}, "strict" as never)).toThrow("rest must be a function, received string");
    const byHand = (input: unknown) => pass(input);
    expect(() => objectWithRest({}, byHand as never)).toThrow(
      "rest is not a validator of this copy of the package. A factory is called first, as in string(), and any other function is given to validator()",
    );
  });

  it("should read every unlisted value before the validator can change the input", () => {
    const input: Record<string, unknown> = { name: "Ada", a: 1, b: 2 };
    const changing = validator((value) => {
      input["b"] = "changed";
      input["c"] = 3;
      return pass(value as number);
    });
    expect(valueOf(objectWithRest({ name: string() }, changing)(input))).toEqual({
      name: "Ada",
      a: 1,
      b: 2,
    });
  });

  it("should be asynchronous when the validator of unlisted keys is, and keep the order of the issues", async () => {
    const slow = validator(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return input === "taken" ? fail({ code: "taken" }) : pass(input as string);
    });
    const handles = objectWithRest({ name: string() }, slow);
    const pending = handles({ name: 1, a: "taken", b: "ada" });
    expect("then" in pending).toBe(true);
    expect(issuesOf(await pending).map((issue) => [issue.path, issue.code])).toEqual([
      [["name"], "invalid_type"],
      [["a"], "taken"],
    ]);
    expect(valueOf(await handles({ name: "Ada", b: "ada" }))).toEqual({ name: "Ada", b: "ada" });
  });

  it("should stay synchronous when the validator of unlisted keys is and every property is", () => {
    expect("then" in objectWithRest({ name: string() }, number())({ name: "Ada", a: 1 })).toBe(false);
  });
});
