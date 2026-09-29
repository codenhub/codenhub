import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, isFree, isPending, valueOf } from "../test-utils";
import { transform } from "./transform";

describe("transform", () => {
  const length = transform(string(), (text) => text.length);

  it("should turn the validated value into another", () => {
    expect(valueOf(length("four"))).toBe(4);
  });

  it("should give the new type", () => {
    const value: number = valueOf(length("a"));
    expect(value).toBe(1);
  });

  it("should not run the function when the wrapped validator failed", () => {
    let calls = 0;
    const counted = transform(number(), (value) => {
      calls += 1;
      return value;
    });
    expect(codesOf(counted("x"))).toEqual(["invalid_type"]);
    expect(calls).toBe(0);
  });

  it("should receive the value the wrapped validator produced, not the input", () => {
    const seen: string[] = [];
    transform(string({ trim: true }), (text) => seen.push(text))("  a  ");
    expect(seen).toEqual(["a"]);
  });

  it("should stay synchronous with a synchronous function", () => {
    expect(isPending(length("a"))).toBe(false);
  });

  it("should become asynchronous with a function that returns a promise", async () => {
    const shout = transform(string(), async (text) => text.toUpperCase());
    const result = shout("a");
    expect(isPending(result)).toBe(true);
    expect(valueOf(await result)).toBe("A");
  });

  it("should stay asynchronous over an asynchronous validator", async () => {
    const upper = transform(isFree, (text) => text.toUpperCase());
    expect(valueOf(await upper("a"))).toBe("A");
    expect(codesOf(await upper("taken"))).toEqual(["taken"]);
  });

  it("should let exceptions thrown by the function propagate, as bugs and not invalid input", () => {
    const broken = transform(string(), () => {
      throw new Error("bug");
    });
    expect(() => broken("a")).toThrow("bug");
  });
});
