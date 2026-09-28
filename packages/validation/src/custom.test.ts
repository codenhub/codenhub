import { describe, expect, it } from "vitest";

import { custom, err, ok, val, ValidationError } from ".";

describe("custom validator", () => {
  it("creates a CustomValidator schema and validates boolean predicates", () => {
    const isEven = val.custom<number, number>((input) => {
      if (typeof input !== "number") {
        return "Must be a number";
      }
      return input % 2 === 0;
    });

    expect(isEven.validate(4)).toEqual({ ok: true, value: 4 });
    expect(isEven.validate(3)).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Custom validation failed",
        path: [],
      },
    });
    expect(isEven.validate("bad" as unknown as number)).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Must be a number",
        path: [],
      },
    });
  });

  it("handles ValidationResult return values from custom functions", () => {
    const schema = custom<string, string>((input) => {
      if (input.startsWith("usr_")) {
        return ok(input);
      }
      return err({ code: "invalid_format", message: "Invalid user id" });
    });

    expect(schema.validate("usr_123")).toEqual({ ok: true, value: "usr_123" });
    expect(schema.validate("bad", { path: ["userId"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Invalid user id",
        path: ["userId"],
      },
    });
  });

  it("handles thrown strings and errors inside custom validators", () => {
    const stringThrower = custom(() => {
      throw "Invalid user id";
    });
    expect(stringThrower.validate("bad", { path: ["userId"] })).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Invalid user id",
        path: ["userId"],
      },
    });

    const errorThrower = custom(() => {
      throw new Error("Unexpected validation failure");
    });
    expect(errorThrower.validate("bad", { path: ["userId"] })).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Unexpected validation failure",
        path: ["userId"],
      },
    });
  });

  it("supports context-based issue registration in CustomValidator", () => {
    const customSchema = custom((input, ctx) => {
      if (input === "invalid") {
        ctx.addIssue({
          code: "invalid_value",
          message: "Input is invalid",
          path: ctx.path,
        });
      }
    });

    expect(customSchema.validate("ok")).toEqual({ ok: true, value: "ok" });
    expect(customSchema.validate("invalid")).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Input is invalid",
        path: [],
      },
    });
  });

  it("supports value transformations in custom validators", () => {
    const uppercaseSchema = custom<string, string>((input) => ok(String(input).toUpperCase()));
    expect(uppercaseSchema.validate("hello")).toEqual({ ok: true, value: "HELLO" });
  });

  it("supports asynchronous custom validator functions via validateAsync", async () => {
    const asyncValidator = custom<string, string>(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (input === "valid") {
        return true;
      }
      if (input === "error_result") {
        return err({ code: "invalid_value", message: "Async check rejected" });
      }
      return "Async validation failed";
    });

    await expect(asyncValidator.validateAsync("valid")).resolves.toEqual({
      ok: true,
      value: "valid",
    });

    await expect(asyncValidator.validateAsync("error_result")).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Async check rejected",
      },
    });

    await expect(asyncValidator.validateAsync("invalid")).resolves.toMatchObject({
      ok: false,
      error: {
        code: "custom",
        message: "Async validation failed",
      },
    });

    await expect(asyncValidator.parseAsync("valid")).resolves.toBe("valid");
    await expect(asyncValidator.parseAsync("invalid")).rejects.toThrow(ValidationError);
  });

  it("fails synchronous validate() when custom validator returns a promise", () => {
    const asyncValidator = custom(async (input) => input === "valid");

    const syncResult = asyncValidator.validate("valid");
    expect(syncResult).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Async custom validator requires validateAsync()",
        path: [],
      },
    });
  });

  it("catches thrown errors in async custom validators", async () => {
    const failingAsync = custom(async () => {
      throw new Error("Async explosion");
    });

    const result = await failingAsync.validateAsync("anything", { path: ["data"] });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Async explosion",
        path: ["data"],
      },
    });
  });
});
