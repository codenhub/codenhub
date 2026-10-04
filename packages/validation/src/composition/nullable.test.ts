import { describe, expect, it } from "vitest";

import { string } from "../primitives/string";
import { accepts, codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { nullable } from "./nullable";
import { nullish } from "./nullish";

describe("nullable", () => {
  const middleName = nullable(string({ min: 1 }));

  it("should accept null and pass it through, and give other values to the wrapped validator", () => {
    expect(valueOf(middleName(null))).toBeNull();
    expect(valueOf(middleName("Lee"))).toBe("Lee");
    expect(codesOf(middleName(""))).toEqual(["too_small"]);
  });

  it("should not accept undefined", () => {
    expect(middleName(undefined).ok).toBe(false);
  });

  it("should stay asynchronous for an asynchronous validator, and answer at once for null", async () => {
    const validator = nullable(isFree);
    expect(isPending(validator(null))).toBe(false);
    expect(codesOf(await validator("taken"))).toEqual(["taken"]);
  });
});

describe("nullish", () => {
  const nickname = nullish(string({ min: 2 }));

  it("should accept null and undefined and pass them through", () => {
    expect(valueOf(nickname(null))).toBeNull();
    expect(valueOf(nickname(undefined))).toBeUndefined();
  });

  it("should give every other value to the wrapped validator", () => {
    expect(valueOf(nickname("Ad"))).toBe("Ad");
    expect(accepts(nickname, "A", "", 0, false)).toEqual([false, false, false, false]);
  });

  it("should make the property optional inside an object, in the type", async () => {
    const { object } = await import("./object");
    const shape = object({ nickname });
    const output: { nickname?: string | null | undefined } = valueOf(shape({}));
    expect(output).toEqual({});
  });

  it("should stay asynchronous for an asynchronous validator, and answer at once for null and undefined", async () => {
    const validator = nullish(isFree);
    expect(isPending(validator(null))).toBe(false);
    expect(isPending(validator(undefined))).toBe(false);
    expect(codesOf(await validator("taken"))).toEqual(["taken"]);
  });

  it("should report the wrapped validator's issues at the property's path inside an object", async () => {
    const { object } = await import("./object");
    expect(issuesOf(object({ nickname })({ nickname: "A" }))).toEqual([
      { code: "too_small", path: ["nickname"], params: { minimum: 2, type: "string" } },
    ]);
  });

  it("should refuse a validator that is not a function when created", () => {
    expect(() => nullish(undefined as never)).toThrow(TypeError);
  });
});
