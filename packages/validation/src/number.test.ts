import { describe, expect, it } from "vitest";

import { val } from ".";

describe("number validators", () => {
  it("validates sign-related constraints", () => {
    expect(val.number(1).positive()).toEqual({ ok: true, value: 1 });
    expect(val.number(-1).negative()).toEqual({ ok: true, value: -1 });
    expect(val.number(0).nonNegative()).toEqual({ ok: true, value: 0 });
    expect(val.number(0).nonPositive()).toEqual({ ok: true, value: 0 });
    expect(val.number(0, { path: ["amount"] }).nonZero()).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must not be zero",
        path: ["amount"],
        expected: "non-zero number",
        received: "0",
      },
    });
  });

  it("validates integer constraints", () => {
    expect(val.number(10).int()).toEqual({ ok: true, value: 10 });
    expect(val.number(Number.MAX_SAFE_INTEGER).safeInt()).toEqual({ ok: true, value: Number.MAX_SAFE_INTEGER });
    expect(val.number(10.5, { path: ["count"] }).int()).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be an integer",
        path: ["count"],
        expected: "integer",
        received: "10.5",
      },
    });
  });

  it("validates finite numbers before method-specific checks", () => {
    expect(val.number(Infinity, { path: ["size"] }).positive()).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be a finite number",
        path: ["size"],
        expected: "finite number",
        received: "Infinity",
      },
    });
  });

  it("validates ranges and invalid range configuration", () => {
    expect(val.number(5).range({ min: 1, max: 10 })).toEqual({ ok: true, value: 5 });
    expect(val.number(0, { path: ["count"] }).range({ min: 1 })).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 1",
        path: ["count"],
        expected: "at least 1",
        received: "0",
      },
    });
    expect(val.number(1).range({ min: 10, max: 1 })).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Range minimum cannot be greater than maximum",
        path: [],
      },
    });
  });

  it("validates finite and port helpers", () => {
    expect(val.number(1).finite()).toEqual({ ok: true, value: 1 });
    expect(val.number(65535).port()).toEqual({ ok: true, value: 65535 });
    expect(val.number(65536, { path: ["port"] }).port()).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be a valid port number (1-65535)",
        path: ["port"],
        expected: "integer from 1 to 65535",
        received: "65536",
      },
    });
  });
});
