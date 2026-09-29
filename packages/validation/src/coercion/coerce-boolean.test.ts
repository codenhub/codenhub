import { describe, expect, it } from "vitest";

import { accepts, issuesOf, valueOf } from "../test-utils";
import { coerceBoolean } from "./coerce-boolean";

describe("coerceBoolean", () => {
  const validator = coerceBoolean();

  it("should convert the usual words in any case, ignoring surrounding whitespace", () => {
    expect(["true", "TRUE", " yes ", "On", "1", 1, true].map((input) => valueOf(validator(input)))).toEqual(
      Array(7).fill(true),
    );
    expect(["false", "No", "off", "0", 0, false].map((input) => valueOf(validator(input)))).toEqual(
      Array(6).fill(false),
    );
  });

  it("should reject anything else, so a typo is not read as false", () => {
    expect(accepts(validator, "", "maybe", "ture", "2", 2, -1, null, undefined, {}, [])).toEqual(Array(10).fill(false));
  });

  it("should say what could not be converted", () => {
    expect(issuesOf(validator("maybe"))[0]?.params).toEqual({ expected: "boolean", received: "string", coerced: true });
  });
});
