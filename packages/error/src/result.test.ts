import { describe, expect, it } from "vitest";

import {
  andThen,
  andThenAsync,
  attempt,
  attemptAsync,
  createErrorRegistry,
  err,
  map,
  mapAsync,
  match,
  ok,
  unwrap,
  unwrapOr,
  type Err,
  type Result,
} from "./index";

describe("ok", () => {
  it("should create a successful result wrapping the provided value", () => {
    const result = ok("user-id");
    expect(result).toEqual({ ok: true, value: "user-id" } satisfies Result<string>);
  });

  it("should preserve reference identity for object values", () => {
    const obj = { id: 1 };
    expect(ok(obj).value).toBe(obj);
  });

  it("should support zero arguments to return Ok<void>", () => {
    const result = ok();
    expect(result).toEqual({ ok: true, value: undefined } satisfies Result<void>);
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

  it("should not expose an unmatched string as the user-facing message", () => {
    const result = err("Missing user id");
    expect(result.error.type).toBe("unknown");
    expect(result.error.message).toBe("An unexpected error occurred.");
    expect(result.error.originalError).toBe("Missing user id");
  });

  it("should use an explicit fallback message for a string error value", () => {
    const result = err("internal detail", { fallbackMessage: "Missing user id" });
    expect(result.error.message).toBe("Missing user id");
  });

  it.each([
    [
      "exact message",
      (registry: ReturnType<typeof createErrorRegistry>) => registry.messages.add("raw secret", { message: "Mapped" }),
      "known",
    ],
    [
      "prefix",
      (registry: ReturnType<typeof createErrorRegistry>) => registry.prefixes.add("raw", { message: "Mapped" }),
      "known",
    ],
    [
      "pattern",
      (registry: ReturnType<typeof createErrorRegistry>) => registry.patterns.add(/raw secret/, { message: "Mapped" }),
      "unexpected",
    ],
  ])("should classify a string value through a %s mapping", (_, register, expectedType) => {
    const registry = createErrorRegistry();
    register(registry);

    expect(err("raw secret", { registry }).error).toMatchObject({
      type: expectedType,
      message: "Mapped",
      originalError: "raw secret",
    });
  });

  it("should classify root and nested string values identically", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/failed to fetch/i, { message: "Network request failed." });

    const rootResult = err("Failed to fetch", { registry });
    const nestedResult = err({ cause: "Failed to fetch" }, { registry });

    expect(rootResult.error.type).toBe(nestedResult.error.type);
    expect(rootResult.error.message).toBe(nestedResult.error.message);
    expect(rootResult.error.message).toBe("Network request failed.");
  });

  it("should produce unknown type when no registry matches", () => {
    const result = err({ code: "unregistered" });
    expect(result.ok).toBe(false);
    expect(result.error.type).toBe("unknown");
  });

  it("should freeze the returned result objects", () => {
    expect(Object.isFrozen(ok("value"))).toBe(true);
    expect(Object.isFrozen(err("internal detail"))).toBe(true);
  });
});

describe("attempt", () => {
  it("should return an Ok result holding the callback value", () => {
    expect(attempt(() => 42)).toEqual({ ok: true, value: 42 });
  });

  it("should capture a thrown value as a normalized Err result", () => {
    const registry = createErrorRegistry();
    registry.names.add("RangeError", { message: "Value out of range." });

    const result = attempt(
      () => {
        throw new RangeError("too big");
      },
      { registry },
    );

    expect(result.ok).toBe(false);
    expect((result as Err).error).toMatchObject({ type: "known", message: "Value out of range." });
  });

  it("should not expose a thrown string as the user-facing message", () => {
    const result = attempt(() => {
      throw "internal detail";
    });

    expect((result as Err).error.message).toBe("An unexpected error occurred.");
    expect((result as Err).error.originalError).toBe("internal detail");
  });

  it("should reject invalid options before running the callback", () => {
    let didRun = false;

    expect(() =>
      attempt(
        () => {
          didRun = true;
          return 1;
        },
        { fallbackMessage: "" },
      ),
    ).toThrow(TypeError);
    expect(didRun).toBe(false);
  });
});

describe("attemptAsync", () => {
  it("should return an Ok result holding the resolved value", async () => {
    await expect(attemptAsync(async () => "done")).resolves.toEqual({ ok: true, value: "done" });
  });

  it("should capture a rejected promise as a normalized Err result", async () => {
    const registry = createErrorRegistry();
    registry.names.add("RangeError", { message: "Value out of range." });

    const result = await attemptAsync(
      async () => {
        throw new RangeError("too big");
      },
      { registry },
    );

    expect(result.ok).toBe(false);
    expect((result as Err).error).toMatchObject({ type: "known", message: "Value out of range." });
  });

  it("should capture a synchronous throw from the callback", async () => {
    const result = await attemptAsync((): number => {
      throw new Error("sync failure");
    });

    expect(result.ok).toBe(false);
  });

  it("should accept a callback returning a plain value", async () => {
    await expect(attemptAsync(() => 7)).resolves.toEqual({ ok: true, value: 7 });
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
    const result = err("internal detail", { fallbackMessage: "failed" });
    const mapped = map(result, (val: number) => val * 2);
    expect(mapped.ok).toBe(false);
    expect((mapped as Err).error.message).toBe("failed");
  });

  it("should propagate mapper exceptions", () => {
    expect(() =>
      map(ok("value"), () => {
        throw new Error("Mapper failed");
      }),
    ).toThrow("Mapper failed");
  });
});

describe("mapAsync", () => {
  it("should transform the value of a successful result with an async mapper", async () => {
    const result = ok(10);
    const mapped = await mapAsync(result, async (val) => val * 2);
    expect(unwrap(mapped)).toBe(20);
  });

  it("should pass a failed result through without calling the async mapper", async () => {
    const result = err("internal detail", { fallbackMessage: "failed" });
    let called = false;
    const mapped = await mapAsync(result, async (val: number) => {
      called = true;
      return val * 2;
    });
    expect(called).toBe(false);
    expect(mapped.ok).toBe(false);
    expect((mapped as Err).error.message).toBe("failed");
  });

  it("should reject when the mapper rejects", async () => {
    await expect(mapAsync(ok("value"), async () => Promise.reject(new Error("Mapper failed")))).rejects.toThrow(
      "Mapper failed",
    );
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
    const result = err("internal detail", { fallbackMessage: "failed" });
    expect(
      match(result, {
        onOk: (val) => `OK: ${val}`,
        onErr: (error) => `ERR: ${error.message}`,
      }),
    ).toBe("ERR: failed");
  });

  it("should propagate callback exceptions", () => {
    expect(() =>
      match(ok("value"), {
        onOk: () => {
          throw new Error("Callback failed");
        },
        onErr: () => "unused",
      }),
    ).toThrow("Callback failed");
  });
});

describe("andThen", () => {
  it("should transform the value of a successful result using a mapper that returns a Result", () => {
    const result = ok(10);
    const mapped = andThen(result, (val) => ok(val * 2));
    expect(unwrap(mapped)).toBe(20);
  });

  it("should return the Err result from the mapper function on success", () => {
    const result = ok(10);
    const mapped = andThen(result, () => err("internal detail", { fallbackMessage: "nested failure" }));
    expect(mapped.ok).toBe(false);
    expect((mapped as Err).error.message).toBe("nested failure");
  });

  it("should forward a failed result without calling the mapper", () => {
    const result = err("internal detail", { fallbackMessage: "failed" });
    let called = false;
    const mapped = andThen(result, (val: number) => {
      called = true;
      return ok(val * 2);
    });
    expect(called).toBe(false);
    expect(mapped.ok).toBe(false);
    expect((mapped as Err).error.message).toBe("failed");
  });

  it("should propagate mapper exceptions", () => {
    expect(() =>
      andThen(ok("value"), () => {
        throw new Error("Mapper failed");
      }),
    ).toThrow("Mapper failed");
  });
});

describe("andThenAsync", () => {
  it("should transform the value of a successful result using an async mapper returning a Result", async () => {
    const result = ok(10);
    const mapped = await andThenAsync(result, async (val) => ok(val * 2));
    expect(unwrap(mapped)).toBe(20);
  });

  it("should return the Err result from the async mapper function on success", async () => {
    const result = ok(10);
    const mapped = await andThenAsync(result, async () =>
      err("internal detail", { fallbackMessage: "nested async failure" }),
    );
    expect(mapped.ok).toBe(false);
    expect((mapped as Err).error.message).toBe("nested async failure");
  });

  it("should forward a failed result without calling the async mapper", async () => {
    const result = err("internal detail", { fallbackMessage: "failed" });
    let called = false;
    const mapped = await andThenAsync(result, async (val: number) => {
      called = true;
      return ok(val * 2);
    });
    expect(called).toBe(false);
    expect(mapped.ok).toBe(false);
    expect((mapped as Err).error.message).toBe("failed");
  });

  it("should reject when the mapper rejects", async () => {
    await expect(andThenAsync(ok("value"), async () => Promise.reject(new Error("Mapper failed")))).rejects.toThrow(
      "Mapper failed",
    );
  });
});

describe("unwrapOr", () => {
  it("should return the value from a successful result", () => {
    expect(unwrapOr(ok("success"), "fallback")).toBe("success");
  });

  it("should return the fallback value from a failed result", () => {
    expect(unwrapOr(err("failed"), "fallback")).toBe("fallback");
  });
});
