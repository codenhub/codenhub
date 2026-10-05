import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { boolean } from "../primitives/boolean";
import { func } from "../primitives/func";
import { string } from "../primitives/string";
import { accepts, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { object } from "./object";
import { objectLike } from "./object-like";
import { optional } from "./optional";

const unreadable = {
  get message(): string {
    throw new Error("boom");
  },
  isRetryable: "yes",
};

describe("objectLike", () => {
  const feedback = objectLike({ message: string({ min: 1 }), isRetryable: optional(boolean()) });

  it("should read inherited and non-enumerable properties, and return a new plain object of the listed ones", () => {
    class Feedback {
      extra = 1;
      get message(): string {
        return "Try again";
      }
    }
    const input = Object.defineProperty(new Feedback(), "isRetryable", { value: true, enumerable: false });
    const output = valueOf(feedback(input));
    expect(output).toEqual({ message: "Try again", isRetryable: true });
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.keys(output)).toEqual(["message", "isRetryable"]);
  });

  it("should accept plain objects, null-prototype objects and built-in instances", () => {
    const bare = Object.assign(Object.create(null) as object, { message: "a" });
    const instance = Object.assign(new Map(), { message: "a" });
    expect(accepts(feedback, { message: "a" }, bare, instance)).toEqual([true, true, true]);
  });

  it("should reject what is not an object, arrays and functions, naming the received type", () => {
    expect(accepts(feedback, null, undefined, 1, "x", [], () => undefined)).toEqual(Array(6).fill(false));
    expect(issuesOf(feedback([]))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "object", received: "array" } },
    ]);
  });

  it("should leave out a property whose value is undefined", () => {
    expect(Object.keys(valueOf(feedback({ message: "a", isRetryable: undefined })))).toEqual(["message"]);
  });

  it("should collect issues from every property, in the order of the shape, with nested paths", () => {
    const nested = objectLike({ a: string(), inner: object({ b: boolean() }), c: func() });
    const pathsOf = (result: Parameters<typeof issuesOf>[0]): unknown[] => issuesOf(result).map((issue) => issue.path);
    expect(pathsOf(nested({ inner: { b: 1 }, c: 1 }))).toEqual([["a"], ["inner", "b"], ["c"]]);
    expect(pathsOf(object({ top: nested })({ top: { a: "", inner: {}, c: 1 } }))).toEqual([
      ["top", "inner", "b"],
      ["top", "c"],
    ]);
  });

  it("should report a property that throws while it is read, and still validate the others", () => {
    expect(issuesOf(feedback(unreadable))).toEqual([
      { code: "invalid_value", path: ["message"], params: { unreadable: true } },
      { code: "invalid_type", path: ["isRetryable"], params: { expected: "boolean", received: "string" } },
    ]);
  });

  it("should report every property of a revoked proxy as unreadable rather than throw", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(issuesOf(feedback(proxy)).map((issue) => issue.params)).toEqual([
      { unreadable: true },
      { unreadable: true },
    ]);
  });

  it("should word its own issues with its message, and leave a property's to the property", () => {
    const worded = objectLike({ message: string() }, { message: "Must be feedback" });
    expect(issuesOf(worded(1))[0]?.message).toBe("Must be feedback");
    expect(issuesOf(worded({}))[0]?.message).toBeUndefined();
    expect(issuesOf(worded(unreadable))[0]?.message).toBe("Must be feedback");
  });

  it("should run its checks on the output once every property has passed", () => {
    const checked = objectLike(
      { message: string({ trim: true }) },
      check((value) => value.message !== "no", { path: ["message"], message: "Refused" }),
    );
    expect(checked({ message: " yes " }).ok).toBe(true);
    expect(issuesOf(checked({ message: " no " }))).toEqual([{ code: "custom", path: ["message"], message: "Refused" }]);
    expect(issuesOf(checked({ message: 1 }))).toHaveLength(1);
  });

  it("should store a property named __proto__ as data", () => {
    const output = valueOf(objectLike({ ["__proto__"]: string() })(JSON.parse('{"__proto__":"a"}')));
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
  });

  it("should be asynchronous exactly when a property validator is", async () => {
    expect(isPending(feedback({ message: "a" }))).toBe(false);
    const pending = objectLike({ name: isFree })({ name: "taken" });
    expect(isPending(pending)).toBe(true);
    expect(issuesOf(await pending)[0]?.path).toEqual(["name"]);
  });

  it("should read each validator of the shape once, so the one it checked is the one it runs", () => {
    let reads = 0;
    const shape = {
      get message() {
        reads += 1;
        return reads === 1 ? string() : (undefined as never);
      },
    };
    expect(objectLike(shape)({ message: "a" }).ok).toBe(true);
    expect(reads).toBe(1);
  });

  it("should reject a shape that is not a plain object of validators, and options it does not read", () => {
    expect(() => objectLike([] as never)).toThrow(TypeError);
    expect(() => objectLike({ a: 1 as never })).toThrow(new TypeError("shape.a must be a function, received number"));
    expect(() => objectLike({ a: string() }, { unknownKeys: "strict" } as never)).toThrow(
      new TypeError("Unknown option unknownKeys"),
    );
  });
});
