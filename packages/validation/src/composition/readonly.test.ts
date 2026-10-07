import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { describe as describeValidator } from "../core/describe";
import { toJsonSchema } from "../interop/json-schema";
import { instanceOf } from "../primitives/instance-of";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { map } from "./map";
import { object } from "./object";
import { objectLike } from "./object-like";
import { pick } from "./pick";
import { readonly } from "./readonly";
import { transform } from "./transform";

describe("readonly", () => {
  it("should freeze the object or array the validator produced, and leave the input as it was", () => {
    const input = { name: "Ada", tags: ["a"] };
    const value = valueOf(readonly(object({ name: string(), tags: array(string()) }))(input));
    expect(value).toEqual(input);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(valueOf(readonly(array(number()))([1])))).toBe(true);
  });

  it("should freeze the value itself and not what is inside it, unless that is wrapped too", () => {
    const shallow = valueOf(readonly(object({ tags: array(string()) }))({ tags: ["a"] })) as { tags: string[] };
    expect(Object.isFrozen(shallow.tags)).toBe(false);
    const deep = valueOf(readonly(object({ tags: readonly(array(string())) }))({ tags: ["a"] })) as { tags: string[] };
    expect(Object.isFrozen(deep.tags)).toBe(true);
  });

  it("should not freeze a value that is the input itself, which the caller owns", () => {
    class Point {
      x = 1;
    }
    const point = new Point();
    expect(Object.isFrozen(valueOf(readonly(objectLike({ x: number() }))(point)))).toBe(true);
    expect(valueOf(readonly(instanceOf(Point))(point))).toBe(point);
    const plain = { a: 1 };
    expect(valueOf(readonly(unknown())(plain))).toBe(plain);
    expect([point, plain].map((value) => Object.isFrozen(value))).toEqual([false, false]);
  });

  it("should pass a primitive and a failure through, and leave a typed array alone", () => {
    expect(valueOf(readonly(string())("a"))).toBe("a");
    expect(issuesOf(readonly(object({ name: string() }))({ name: 1 })).map((issue) => issue.path)).toEqual([["name"]]);
    const bytes = valueOf(readonly(transform(string(), () => new Uint8Array(2)))("a"));
    expect(Object.isFrozen(bytes)).toBe(false);
    expect(Object.isFrozen(valueOf(readonly(map(string(), number()))(new Map([["a", 1]]))))).toBe(true);
  });

  it("should freeze what an asynchronous validator settles to", async () => {
    const list = readonly(array(string(check(async () => true))));
    const result = list(["a"]);
    expect(isPending(result)).toBe(true);
    expect(Object.isFrozen(valueOf(await result))).toBe(true);
  });

  it("should be described by what it wraps, and written as that to a JSON Schema", () => {
    const inner = object({ name: string() });
    const frozen = readonly(inner);
    expect(describeValidator(frozen)).toEqual({ kind: "readonly", inner });
    expect(toJsonSchema(frozen)).toEqual(toJsonSchema(inner));
    expect(() => pick(frozen as never, ["name"] as never)).toThrow(TypeError);
    expect(Object.isFrozen(valueOf(readonly(pick(inner, ["name"]))({ name: "a" })))).toBe(true);
  });

  it("should refuse what is not a validator", () => {
    expect(() => readonly({} as never)).toThrow(TypeError);
  });
});
