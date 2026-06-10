import { describe, expect, it } from "vitest";

import { custom, err, ok } from ".";

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
});
