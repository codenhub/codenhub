import { describe, expect, it } from "vitest";

import { email } from "../formats/email";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, valueOf } from "../test-utils";
import { object } from "./object";
import { partial } from "./partial";

describe("partial", () => {
  const user = { name: string({ min: 2 }), email: email(), age: number() };

  it("should make every property optional", () => {
    const update = object(partial(user));
    expect(valueOf(update({}))).toEqual({});
    expect(valueOf(update({ name: "Ada" }))).toEqual({ name: "Ada" });
  });

  it("should still validate the properties that are present", () => {
    expect(codesOf(object(partial(user))({ name: "A", email: "nope" }))).toEqual(["too_small", "invalid_format"]);
  });

  it("should not accept null for an omitted property", () => {
    expect(object(partial(user))({ name: null }).ok).toBe(false);
  });

  it("should leave the original shape unchanged", () => {
    partial(user);
    expect(object(user)({}).ok).toBe(false);
  });

  it("should give optional property types", () => {
    const output: { name?: string | undefined; email?: string | undefined; age?: number | undefined } = valueOf(
      object(partial(user))({ age: 1 }),
    );
    expect(output).toEqual({ age: 1 });
  });
});
