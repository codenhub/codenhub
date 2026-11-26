import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { isPlainArray, isPlainObject } from "./plain";

describe("isPlainObject", () => {
  it("should accept a plain object of this realm, another realm, or with a null prototype", () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(runInNewContext("({ a: 1 })"))).toBe(true);
  });

  it("should refuse arrays, class instances, and objects whose prototype is not an Object.prototype", () => {
    class Claims {}
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(runInNewContext("[]"))).toBe(false);
    expect(isPlainObject(new Claims())).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(Object.create({}))).toBe(false);
    expect(isPlainObject(Object.create({ constructor: Object }))).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("text")).toBe(false);
  });
});

describe("isPlainArray", () => {
  it("should accept an array of this realm or another", () => {
    expect(isPlainArray([1])).toBe(true);
    expect(isPlainArray(runInNewContext("[1, 2]"))).toBe(true);
  });

  it("should refuse an Array subclass, a swapped prototype, and array-likes", () => {
    class Claims extends Array {}
    const swapped: unknown[] = [];
    Object.setPrototypeOf(swapped, { constructor: Array });
    expect(isPlainArray(new Claims())).toBe(false);
    expect(isPlainArray(runInNewContext("class Sub extends Array {}; new Sub()"))).toBe(false);
    expect(isPlainArray(swapped)).toBe(false);
    expect(isPlainArray({ length: 0 })).toBe(false);
  });
});
