import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { fail, pass } from "../core/result";
import type { AsyncValidator, Validator } from "../core/types";
import { email } from "../formats/email";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, valueOf } from "../test-utils";
import { pipe } from "./pipe";

describe("pipe", () => {
  const address = pipe(string({ trim: true, case: "lower" }), email());

  it("should feed each validator the value the previous one produced", () => {
    expect(valueOf(address("  Ada@Example.COM "))).toBe("ada@example.com");
  });

  it("should stop at the first failure and report only that validator's issues", () => {
    expect(codesOf(address(42))).toEqual(["invalid_type"]);
    expect(codesOf(address("nope"))).toEqual(["invalid_format"]);
  });

  it("should not run later validators after a failure", () => {
    let calls = 0;
    const later: Validator<unknown> = (input) => {
      calls += 1;
      return pass(input);
    };
    pipe(number(), later)("not a number");
    expect(calls).toBe(0);
  });

  it("should let a later validator change the type", () => {
    const length = pipe(string(), (input): ReturnType<Validator<number>> => pass((input as string).length));
    expect(valueOf(length("four"))).toBe(4);
  });

  it("should work with a single validator", () => {
    expect(valueOf(pipe(string())("a"))).toBe("a");
  });

  it("should be asynchronous when any step is, and preserve order", async () => {
    const taken: AsyncValidator<string> = async (input) =>
      input === "admin" ? fail({ code: "taken" }) : pass(input as string);
    const username = pipe(string({ trim: true }), taken, string(check((name) => name.length > 2, { code: "short" })));
    expect(valueOf(await username(" ada "))).toBe("ada");
    expect(codesOf(await username(" admin "))).toEqual(["taken"]);
    expect(codesOf(await username(" ab "))).toEqual(["short"]);
  });

  it("should stay synchronous when every step is", () => {
    expect("then" in address("a@example.com")).toBe(false);
  });
});
