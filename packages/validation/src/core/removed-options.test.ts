import { describe, expect, it } from "vitest";

import { coerceNumber } from "../coercion/coerce-number";
import { coerceString } from "../coercion/coerce-string";
import { array } from "../composition/array";
import { url } from "../formats/url";
import { number } from "../primitives/number";
import { string } from "../primitives/string";

// Options 0.1.0 had and 0.2.0 removed. Ignored as unknown options, each would accept input it was meant to
// reject, and a call through a variable or from JavaScript is not caught by the types.
describe("options removed in 0.2.0", () => {
  it.each([
    ["string", () => string({ pattern: /^a/ } as never), "pattern(re)"],
    ["string", () => string({ startsWith: "a" } as never), "startsWith(text)"],
    ["string", () => string({ endsWith: "a" } as never), "endsWith(text)"],
    ["string", () => string({ includes: "a" } as never), "includes(text)"],
    ["string", () => string({ lowercase: true } as never), 'case: "lower"'],
    ["string", () => string({ uppercase: true } as never), 'case: "upper"'],
    ["coerceString", () => coerceString({ pattern: /^a/ } as never), "pattern(re)"],
    ["number", () => number({ multipleOf: 5 } as never), "multipleOf(step)"],
    ["number", () => number({ nonZero: true } as never), "nonZero()"],
    ["coerceNumber", () => coerceNumber({ multipleOf: 5 } as never), "multipleOf(step)"],
    ["array", () => array(string(), { unique: true } as never), "unique()"],
    ["url", () => url({ allowLocal: true } as never), "host: hostname()"],
  ])("should throw a TypeError naming the replacement from %s", (_name, make, replacement) => {
    expect(make).toThrow(TypeError);
    expect(make).toThrow(replacement);
  });

  it("should throw even when the removed option is false or undefined, since the call still needs migrating", () => {
    expect(() => string({ lowercase: false } as never)).toThrow(TypeError);
    expect(() => array(string(), { unique: undefined } as never)).toThrow(TypeError);
  });

  it("should not reject the options that remain", () => {
    expect(() => string({ min: 1, case: "lower", trim: true })).not.toThrow();
    expect(() => number({ int: true })).not.toThrow();
    expect(() => array(string(), { max: 3 })).not.toThrow();
  });
});
