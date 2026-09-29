import { describe, expect, it } from "vitest";

import { val } from "./index";
import { messagesOf } from "./test-utils";

describe("boolean", () => {
  it("accepts booleans only", () => {
    expect(val.boolean().validate(true).ok).toBe(true);
    expect(val.boolean().validate(false).ok).toBe(true);
    expect(messagesOf(val.boolean().validate("true"))).toEqual(["Expected boolean, received string"]);
    expect(val.boolean().validate(1).ok).toBe(false);
  });

  it("true() and false() pin the value", () => {
    expect(val.boolean().true().validate(true).ok).toBe(true);
    expect(messagesOf(val.boolean().true("must accept").validate(false))).toEqual(["must accept"]);
    expect(val.boolean().false().validate(true).ok).toBe(false);
    expect(val.boolean().false().validate(false).ok).toBe(true);
  });
});
