import { describe, expect, it } from "vitest";

import { createErrorRegistry, err, map, match, ok, unwrap, type Err, type Result } from "./index";

describe("ok", () => {
  it("should create a successful result wrapping the provided value", () => {
    const result = ok("user-id");
    expect(result).toEqual({ ok: true, value: "user-id" } satisfies Result<string>);
  });

  it("should preserve reference identity for object values", () => {
    const obj = { id: 1 };
    expect(ok(obj).value).toBe(obj);
  });
});

describe("err", () => {
  it("should create a failed result containing a normalized AppError", () => {
    const registry = createErrorRegistry();
    registry.codes.add("invalid_credentials", { message: "Invalid email or password." });
    const result = err({ code: "invalid_credentials" }, { registry });
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe("Invalid email or password.");
  });

  it("should use a string error value as the fallback message", () => {
    const result = err("Missing user id");
    expect(result.error.type).toBe("unknown");
    expect(result.error.message).toBe("Missing user id");
  });

  it("should produce unknown type when no registry matches", () => {
    const result = err({ code: "unregistered" });
    expect(result.ok).toBe(false);
    expect(result.error.type).toBe("unknown");
  });
});

describe("unwrap", () => {
  it("should return the value from a successful result", () => {
    expect(unwrap(ok("value"))).toBe("value");
  });

  it("should throw the normalized AppError from a failed result", () => {
    expect(() => unwrap(err("error message"))).toThrow(Error);
  });
});

describe("map", () => {
  it("should transform the value of a successful result with the mapper", () => {
    const result = ok(10);
    expect(unwrap(map(result, (val) => val * 2))).toBe(20);
  });

  it("should pass a failed result through without calling the mapper", () => {
    const result = err("failed");
    const mapped = map(result, (val: number) => val * 2);
    expect(mapped.ok).toBe(false);
    expect((mapped as Err).error.message).toBe("failed");
  });
});

describe("match", () => {
  it("should call onOk with the value for a successful result", () => {
    const result = ok("success");
    expect(
      match(result, {
        onOk: (val) => `OK: ${val}`,
        onErr: (error) => `ERR: ${error.message}`,
      }),
    ).toBe("OK: success");
  });

  it("should call onErr with the AppError for a failed result", () => {
    const result = err("failed");
    expect(
      match(result, {
        onOk: (val) => `OK: ${val}`,
        onErr: (error) => `ERR: ${error.message}`,
      }),
    ).toBe("ERR: failed");
  });
});
