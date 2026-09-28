import { describe, expect, it } from "vitest";

import { custom, ok, pipe, val, ValidationError } from ".";

describe("pipe", () => {
  it("pipes coercion output into validator schema", () => {
    const portSchema = val.pipe(val.coerce.int(), val.number().port());

    expect(portSchema.validate("3000")).toEqual({
      ok: true,
      value: 3000,
    });

    expect(portSchema.validate("abc")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "abc" to integer',
        path: [],
        expected: "integer string",
        received: "abc",
      },
    });

    expect(portSchema.validate("99999")).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be a valid port number (1-65535)",
        path: [],
        expected: "integer from 1 to 65535",
        received: "99999",
      },
    });
  });

  it("supports chaining multiple validators with top-level pipe function", () => {
    const schema = pipe(val.coerce.string(), val.string().trim(), val.string().email());

    expect(schema.validate("   user@example.com   ")).toEqual({
      ok: true,
      value: "user@example.com",
    });
  });

  it("supports .pipe() method on BaseValidator instances", () => {
    const schema = val.coerce.number().pipe(val.number().min(0));

    expect(schema.validate("42")).toEqual({
      ok: true,
      value: 42,
    });

    expect(schema.validate("-10")).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 0",
        path: [],
        expected: "at least 0",
        received: "-10",
      },
    });
  });

  it("executes async pipeline sequentially with validateAsync", async () => {
    const executedSteps: string[] = [];

    const asyncStep1 = custom<string, string>(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      executedSteps.push("step1");
      return ok(input.trim());
    });

    const asyncStep2 = custom<string, string>(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      executedSteps.push("step2");
      return ok(input.toUpperCase());
    });

    const pipeline = pipe(val.string(), asyncStep1, asyncStep2);

    const result = await pipeline.validateAsync("  hello  ");
    expect(result).toEqual({
      ok: true,
      value: "HELLO",
    });
    expect(executedSteps).toEqual(["step1", "step2"]);
  });

  it("aborts async pipeline at the first failing validator", async () => {
    const executedSteps: string[] = [];

    const step1 = custom<string, string>(async () => {
      executedSteps.push("step1");
      return "bad_format";
    });

    const step2 = val.string().email();

    const step3 = custom<string, string>(async (input) => {
      executedSteps.push("step3");
      return input;
    });

    const pipeline = pipe(step1, step2, step3);

    const result = await pipeline.validateAsync("initial");
    expect(result.ok).toBe(false);
    expect(executedSteps).toEqual(["step1"]);
  });

  it("supports parseAsync on piped validators", async () => {
    const asyncCoerce = custom<number, string>(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Number(input);
    });

    const pipeline = pipe(val.string(), asyncCoerce, val.number().positive());

    await expect(pipeline.parseAsync("42")).resolves.toBe(42);
    await expect(pipeline.parseAsync("-5")).rejects.toThrow(ValidationError);
  });
});
