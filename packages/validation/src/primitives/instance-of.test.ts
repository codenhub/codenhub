import { describe, expect, it } from "vitest";

import { accepts, issuesOf, valueOf } from "../test-utils";
import { instanceOf } from "./instance-of";

class Animal {}
class Dog extends Animal {}
abstract class Shape {}
class Circle extends Shape {}

describe("instanceOf", () => {
  it("should refuse a target that is not a function when created, rather than throw on every input", () => {
    expect(() => instanceOf(undefined as unknown as typeof Animal)).toThrow(TypeError);
    expect(() => instanceOf({} as unknown as typeof Animal)).toThrow(TypeError);
  });

  it("should accept instances of the class and of its subclasses", () => {
    expect(accepts(instanceOf(Animal), new Animal(), new Dog(), {}, "dog", null)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("should accept an abstract class as the target", () => {
    expect(accepts(instanceOf(Shape), new Circle(), {})).toEqual([true, false]);
  });

  it("should work with built-ins", () => {
    expect(accepts(instanceOf(Date), new Date(), 0)).toEqual([true, false]);
  });

  it("should return the instance, typed", () => {
    const dog = new Dog();
    const found: Dog = valueOf(instanceOf(Dog)(dog));
    expect(found).toBe(dog);
  });

  it("should name the class and the received type", () => {
    expect(issuesOf(instanceOf(Dog)("rex"))[0]?.params).toEqual({ expected: "instance of Dog", received: "string" });
  });

  it("should name a class that has no name", () => {
    expect(issuesOf(instanceOf(class {})("rex"))[0]?.params).toEqual({
      expected: "instance of anonymous class",
      received: "string",
    });
  });
});

describe("instanceOf, given a target with a Symbol.hasInstance of its own", () => {
  it("should decide by that rule, without trying it on an object made up when created", () => {
    let calls = 0;
    class Even {
      static [Symbol.hasInstance](value: unknown): boolean {
        calls += 1;
        return typeof value === "number" && value % 2 === 0;
      }
    }
    const even = Even as unknown as abstract new () => number;
    const isEven = instanceOf(even);
    expect(calls).toBe(0);
    expect(accepts(isEven, 2, 3, "2")).toEqual([true, false, false]);
  });

  it("should treat a rule of null as absent and refuse one that is not a function", () => {
    class Plain {}
    Object.defineProperty(Plain, Symbol.hasInstance, { value: null });
    expect(accepts(instanceOf(Plain), new Plain(), {})).toEqual([true, false]);
    class Broken {}
    Object.defineProperty(Broken, Symbol.hasInstance, { value: 1 });
    expect(() => instanceOf(Broken)).toThrow(TypeError);
  });

  it("should reject a value its rule throws for, rather than throw", () => {
    class Throwing {
      static [Symbol.hasInstance](): boolean {
        throw new Error("boom");
      }
    }
    const throwing = Throwing;
    expect(accepts(instanceOf(throwing), {})).toEqual([false]);
  });
});
