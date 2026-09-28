import { describe, expect, it } from "vitest";

import { custom, err, ok, val } from ".";

describe("custom", () => {
  it("returns successful parsed custom validator results", () => {
    expect(custom<string>("usr_123", (value) => ok(value))).toEqual({ ok: true, value: "usr_123" });
  });

  it("normalizes returned validation failures with the caller path", () => {
    expect(
      custom("bad", () => err({ code: "invalid_format", message: "Invalid user id" }), { path: ["userId"] }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Invalid user id",
        path: ["userId"],
      },
    });
  });

  it("normalizes thrown strings and errors", () => {
    expect(
      custom(
        "bad",
        () => {
          throw "Invalid user id";
        },
        { path: ["userId"] },
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Invalid user id",
        path: ["userId"],
      },
    });

    expect(
      custom(
        "bad",
        () => {
          throw new Error("Unexpected validation failure");
        },
        { path: ["userId"] },
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Unexpected validation failure",
        path: ["userId"],
      },
    });
  });

  it("creates a CustomValidator schema when passed a validator function", () => {
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
});
