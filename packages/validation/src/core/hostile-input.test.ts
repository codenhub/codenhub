import { describe, expect, it } from "vitest";

import { array } from "../composition/array";
import { tuple } from "../composition/tuple";
import { searchParams } from "../formats/search-params";
import { instanceOf } from "../primitives/instance-of";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { codesOf } from "../test-utils";

const revoked = (): object => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
};

describe("input that throws when it is inspected", () => {
  it("should be rejected as the wrong type, not throw, by array, tuple and instanceOf", () => {
    expect(codesOf(array(string())(revoked()))).toEqual(["invalid_type"]);
    expect(codesOf(tuple([string()])(revoked()))).toEqual(["invalid_type"]);
    expect(codesOf(instanceOf(Date)(revoked()))).toEqual(["invalid_type"]);
  });

  it("should be rejected as no query by searchParams, as by every other validator", () => {
    const trapped = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("trap");
        },
      },
    );
    expect(codesOf(searchParams(unknown())(revoked()))).toEqual(["invalid_type"]);
    expect(codesOf(searchParams(unknown())(trapped))).toEqual(["invalid_type"]);
  });
});

describe("instanceOf, given a function instanceof cannot test against", () => {
  it("should throw when it is made, not on every object it is given", () => {
    expect(() => instanceOf((() => undefined) as never)).toThrow(TypeError);
  });
});

describe("instanceOf, given a class with a Symbol.hasInstance of its own", () => {
  class Tagged {
    static [Symbol.hasInstance](input: unknown): boolean {
      if (typeof input !== "object" || input === null || !("tag" in input)) {
        throw new TypeError("not a tagged object");
      }
      return input.tag === "ok";
    }
  }

  it("should not run that rule when it is made, and use it on the input", () => {
    const tagged = instanceOf(Tagged);
    expect(codesOf(tagged({ tag: "ok" }))).toEqual([]);
    expect(codesOf(tagged({ tag: "no" }))).toEqual(["invalid_type"]);
    expect(codesOf(tagged({}))).toEqual(["invalid_type"]);
  });
});
