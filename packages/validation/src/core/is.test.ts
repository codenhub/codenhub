import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { is } from "./is";
import { pass } from "./result";
import type { AsyncValidator, Validator } from "./types";

describe("is", () => {
  it("should be true when the validator accepts the input", () => {
    expect(is(string(), "text")).toBe(true);
  });

  it("should be false when the validator rejects the input", () => {
    expect(is(number(), "text")).toBe(false);
  });

  it("should read a result written by hand as assert does", () => {
    expect(is((() => ({ ok: true, value: 1 })) as never, "text")).toBe(true);
    expect(is((() => ({ ok: false, error: { issues: [{ code: "custom", path: [] }] } })) as never, "text")).toBe(false);
  });

  it("should name the mistake, as assert does, when a validator returns no result", () => {
    for (const returned of [undefined, null, { ok: 1 }, { ok: false, error: { issues: [] } }]) {
      expect(() => is((() => returned) as never, "text")).toThrow(
        new TypeError("is() needs a validator that returns a result, and a failure that holds an issue"),
      );
    }
  });

  it("should throw a TypeError naming the fix when the validator is asynchronous", () => {
    const asynchronous = (async (input) => pass(input)) as AsyncValidator<unknown> as Validator<unknown>;
    expect(() => is(asynchronous, 1)).toThrow(/needs a synchronous validator/);
  });

  it("should not leave an unhandled rejection behind for an asynchronous validator that fails", async () => {
    const rejecting = (() => Promise.reject(new Error("boom"))) as unknown as Validator<unknown>;
    expect(() => is(rejecting, 1)).toThrow(TypeError);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
