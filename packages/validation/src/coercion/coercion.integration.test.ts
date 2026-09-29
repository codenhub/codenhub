import { describe, expect, it } from "vitest";

import { array } from "../composition/array";
import { object } from "../composition/object";
import { pipe } from "../composition/pipe";
import { transform } from "../composition/transform";
import { withDefault } from "../composition/with-default";
import { string } from "../primitives/string";
import { issuesOf, valueOf } from "../test-utils";
import { coerceBoolean } from "./coerce-boolean";
import { coerceNumber } from "./coerce-number";

describe("coercing a whole environment", () => {
  const env = object({
    PORT: coerceNumber({ int: true, min: 1, max: 65535 }),
    DEBUG: withDefault(coerceBoolean(), false),
    ORIGINS: transform(string(), (text) => text.split(",")),
    RETRIES: withDefault(coerceNumber({ int: true, min: 0 }), 3),
  });

  it("should parse text values into typed configuration", () => {
    expect(valueOf(env({ PORT: "8080", ORIGINS: "a,b" }))).toEqual({
      PORT: 8080,
      DEBUG: false,
      ORIGINS: ["a", "b"],
      RETRIES: 3,
    });
  });

  it("should report every bad variable at its name", () => {
    expect(issuesOf(env({ PORT: "eighty", DEBUG: "maybe", ORIGINS: "a" })).map((issue) => issue.path)).toEqual([
      ["PORT"],
      ["DEBUG"],
    ]);
  });

  it("should work for a query string of repeated values", () => {
    const ids = array(coerceNumber({ int: true }), { min: 1 });
    expect(valueOf(ids(["1", "2", "3"]))).toEqual([1, 2, 3]);
    expect(issuesOf(ids(["1", "x"])).map((issue) => issue.path)).toEqual([[1]]);
  });

  it("should combine with pipe to clean and then convert", () => {
    const count = pipe(string({ trim: true }), coerceNumber({ int: true }));
    expect(valueOf(count(" 42 "))).toBe(42);
  });
});
