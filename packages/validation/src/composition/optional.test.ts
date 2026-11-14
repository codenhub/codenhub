import { describe, expect, it } from "vitest";

import { validator } from "../builders/validator";
import { fail, pass } from "../core/result";
import type { AsyncValidator } from "../core/types";
import { string } from "../primitives/string";
import { accepts, codesOf, valueOf } from "../test-utils";
import { optional } from "./optional";

describe("optional", () => {
  const nickname = optional(string({ min: 2 }));

  it("should accept undefined and pass it through", () => {
    expect(valueOf(nickname(undefined))).toBeUndefined();
  });

  it("should hand every other value to the wrapped validator", () => {
    expect(valueOf(nickname("Ad"))).toBe("Ad");
    expect(codesOf(nickname("A"))).toEqual(["too_small"]);
  });

  it("should not treat null or the empty string as absent", () => {
    expect(accepts(nickname, null, "")).toEqual([false, false]);
  });

  it("should keep an asynchronous validator asynchronous, and answer at once for undefined", async () => {
    const taken: AsyncValidator<string> = validator(async (input) =>
      input === "admin" ? fail({ code: "taken" }) : pass(input as string),
    );
    const username = optional(taken);
    expect(valueOf(await username(undefined))).toBeUndefined();
    expect(codesOf(await username("admin"))).toEqual(["taken"]);
  });
});
