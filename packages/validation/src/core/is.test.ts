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

  it("should give a boolean even when a validator written by hand sets ok to something else", () => {
    expect(is((() => ({ ok: 1 })) as never, "text")).toBe(false);
    expect(is((() => ({ ok: true, value: 1 })) as never, "text")).toBe(true);
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
