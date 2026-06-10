import { describe, expect, it } from "vitest";

import { val } from ".";

describe("object validators", () => {
  it("accepts plain objects and null-prototype objects", () => {
    const plain = { email: "user@example.com" };
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    nullPrototype.email = "user@example.com";

    expect(val.object(plain).plain()).toEqual({ ok: true, value: plain });
    expect(val.object(nullPrototype).plain()).toEqual({ ok: true, value: nullPrototype });
  });

  it("rejects arrays as non-plain objects", () => {
    expect(val.object([], { path: ["user"] }).plain()).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected object, got array",
        path: ["user"],
        expected: "plain object",
        received: "array",
      },
    });
  });

  it("validates required own keys", () => {
    expect(val.object({ email: undefined }).hasKeys(["email"])).toEqual({ ok: true, value: { email: undefined } });
    expect(val.object({}, { path: ["user"] }).hasKeys(["email"])).toEqual({
      ok: false,
      error: {
        code: "missing_key",
        message: "Missing required key: email",
        path: ["user", "email"],
        expected: "required key",
        received: "missing",
      },
    });
  });
});

describe("array validators", () => {
  it("validates array lengths", () => {
    expect(val.array<string>(["a", "b"]).minLength(2)).toEqual({ ok: true, value: ["a", "b"] });
    expect(val.array<string>(["a", "b"]).maxLength(2)).toEqual({ ok: true, value: ["a", "b"] });
    expect(val.array<string>(["a"]).notEmpty()).toEqual({ ok: true, value: ["a"] });
  });

  it("rejects invalid array length limits", () => {
    expect(val.array([]).minLength(-1)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Minimum length must be a finite non-negative number",
        path: [],
      },
    });
    expect(val.array([]).maxLength(Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Maximum length must be a finite non-negative number",
        path: [],
      },
    });
  });

  it("rejects non-array input for all array checks", () => {
    expect(val.array("items", { path: ["items"] }).notEmpty()).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected array, got items",
        path: ["items"],
        expected: "array",
        received: "items",
      },
    });
  });
});
