import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { codesOf, messagesOf, pathsOf, valueOf } from "./test-utils";

describe("json", () => {
  it("parses a JSON string", () => {
    expect(valueOf(val.json().validate('{"a":[1,2]}'))).toEqual({ a: [1, 2] });
  });

  it("validates the parsed value against a schema", () => {
    const schema = val.json(val.object({ a: val.number() }));
    expect(valueOf(schema.validate('{"a":1}'))).toEqual({ a: 1 });
    expect(pathsOf(schema.validate('{"a":"x"}'))).toEqual([["a"]]);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<{ a: number }>();
  });

  it("reports invalid JSON with a stable code", () => {
    expect(codesOf(val.json().validate("{nope"))).toEqual(["invalid_format"]);
    expect(messagesOf(val.json(undefined, "bad json").validate("{nope"))).toEqual(["bad json"]);
  });

  it("rejects non-strings without parsing them", () => {
    expect(messagesOf(val.json().validate({}))).toEqual(["Expected string, received object"]);
  });
});
