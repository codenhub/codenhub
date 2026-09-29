import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { codesOf, issuesOf, messagesOf, pathsOf, valueOf } from "./test-utils";

describe("map", () => {
  const headers = val.map(val.string(), val.number());

  it("validates keys and values", () => {
    expect(valueOf(headers.validate(new Map([["a", 1]])))).toEqual(new Map([["a", 1]]));
    expectTypeOf<Infer<typeof headers>>().toEqualTypeOf<Map<string, number>>();
  });

  it("locates an entry by its key when it is a string or number", () => {
    expect(
      pathsOf(
        headers.validate(
          new Map<unknown, unknown>([
            ["a", 1],
            ["b", "x"],
          ]),
        ),
      ),
    ).toEqual([["b"]]);
    expect(codesOf(headers.validate(new Map<unknown, unknown>([[1, 1]])))).toEqual(["invalid_type"]);
  });

  it("locates an entry by its position when the key is not a string or number", () => {
    const schema = val.map(val.instanceOf(Date), val.number());
    expect(
      pathsOf(
        schema.validate(
          new Map<unknown, unknown>([
            [new Date(), 1],
            [new Date(), "x"],
          ]),
        ),
      ),
    ).toEqual([[1]]);
  });

  it("reports both a bad key and a bad value of one entry", () => {
    expect(issuesOf(headers.validate(new Map<unknown, unknown>([[1, "x"]])))).toHaveLength(2);
  });

  it("rejects non-maps", () => {
    expect(messagesOf(headers.validate({}))).toEqual(["Expected map, received object"]);
  });

  it("checks size", () => {
    expect(headers.min(1).validate(new Map()).ok).toBe(false);
    expect(
      headers.max(1).validate(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      ).ok,
    ).toBe(false);
    expect(headers.nonEmpty().validate(new Map()).ok).toBe(false);
  });
});
