import { afterEach, describe, expect, it } from "vitest";

import { createAppError, isAppError, DEFAULT_APP_ERROR_MESSAGE, createErrorRegistry, getErrorRegistry } from "./index";

afterEach(() => {
  getErrorRegistry().clear();
});

describe("createAppError — basic normalization", () => {
  it("should return an unknown AppError with fallback message when no registry matches", () => {
    const appError = createAppError({ code: "invalid_credentials", message: "Failed to fetch" });
    expect(appError.type).toBe("unknown");
    expect(appError.message).toBe(DEFAULT_APP_ERROR_MESSAGE);
    expect(appError.messageKey).toBe(null);
    expect(appError.source).toBe(null);
    expect(appError.isRetryable).toBe(false);
  });

  it("should return as-is when input is already a normalized AppError", () => {
    const original = createAppError("Something failed");
    expect(createAppError(original)).toBe(original);
  });

  it("should use the active global registry by default", () => {
    getErrorRegistry().codes.add("invalid_credentials", {
      message: "Invalid email or password.",
      source: "auth",
    });

    expect(createAppError({ code: "invalid_credentials" })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
      source: "auth",
    });
  });

  it("should pass the original error as cause on the native Error", () => {
    const original = new Error("Failed");
    const appError = createAppError(original);
    expect(appError.cause).toBe(original);
  });

  it("should coerce a numeric code to string when looking up registry codes", () => {
    const registry = createErrorRegistry();
    registry.codes.add("500", { message: "Internal server error." });
    expect(createAppError({ code: 500 }, { registry })).toMatchObject({
      type: "known",
      message: "Internal server error.",
    });
  });

  it("should normalize function-based error objects", () => {
    const registry = createErrorRegistry();
    registry.codes.add("FUNC_ERROR", { message: "Function failed." });
    const errorFn = Object.assign(() => {}, { code: "FUNC_ERROR" });
    const appError = createAppError(errorFn, { registry });
    expect(appError.type).toBe("known");
    expect(appError.originalError).toBe(errorFn);
  });

  it("should not throw when unknown error fields have throwing accessors", () => {
    const error = {
      get message(): string {
        throw new Error("Getter failed.");
      },
    };
    expect(() => createAppError(error)).not.toThrow();
    expect(createAppError(error).type).toBe("unknown");
  });
});

describe("createAppError — registry matching priority", () => {
  it("should classify via exact code match", () => {
    const registry = createErrorRegistry();
    registry.codes.add("invalid_credentials", { message: "Invalid email or password.", source: "auth" });
    expect(createAppError({ code: "invalid_credentials" }, { registry })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
    });
  });

  it("should classify via exact name match", () => {
    const registry = createErrorRegistry();
    registry.names.add("AbortError", { message: "Request cancelled.", source: "browser" });
    expect(createAppError(new DOMException("Aborted", "AbortError"), { registry })).toMatchObject({
      type: "known",
      message: "Request cancelled.",
    });
  });

  it("should classify via exact message match", () => {
    const registry = createErrorRegistry();
    registry.messages.add("Exact message to match", { message: "Matched exact message" });
    expect(createAppError(new Error("Exact message to match"), { registry })).toMatchObject({
      type: "known",
      message: "Matched exact message",
    });
  });

  it("should classify via prefix match", () => {
    const registry = createErrorRegistry();
    registry.prefixes.add("Upload failed:", { message: "Surface failure." });
    expect(createAppError(new Error("Upload failed: network"), { registry })).toMatchObject({
      type: "known",
      message: "Surface failure.",
    });
  });

  it("should pick the longest prefix when multiple prefixes match the same message", () => {
    const registry = createErrorRegistry();
    registry.prefixes.add("Upload failed", { message: "Short match." });
    registry.prefixes.add("Upload failed: image", { message: "Image upload failed." });
    expect(createAppError(new Error("Upload failed: image too large"), { registry })).toMatchObject({
      type: "known",
      message: "Image upload failed.",
    });
  });

  it("should classify via pattern match as unexpected", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/failed to fetch/i, { message: "Network request failed.", isRetryable: true });
    expect(createAppError(new Error("Failed to fetch"), { registry })).toMatchObject({
      type: "unexpected",
      message: "Network request failed.",
      isRetryable: true,
    });
  });

  it("should prioritize surface-level classification over nested wrapper classifications", () => {
    const registry = createErrorRegistry();
    registry.codes.add("nested_code", { message: "Nested failure." });
    registry.prefixes.add("Upload failed:", { message: "Surface failure." });

    const appError = createAppError(
      { cause: { code: "nested_code" }, message: "Upload failed: network" },
      { registry },
    );

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Surface failure.");
  });

  it("should prioritize any known match over any unexpected match across all candidates", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/network error/i, { message: "Generic network failure." });
    registry.codes.add("AUTH_EXPIRED", { message: "Auth expired, please log in again." });

    const nestedError = { code: "AUTH_EXPIRED" };
    const outerError = new Error("Generic network error occurred", { cause: nestedError });

    expect(createAppError(outerError, { registry })).toMatchObject({
      type: "known",
      message: "Auth expired, please log in again.",
    });
  });
});

describe("createAppError — nested wrapper traversal", () => {
  it("should resolve nested wrapper errors without following cycles forever", () => {
    const registry = createErrorRegistry();
    const nestedError = { code: "known_code" };
    const outerError: Record<string, unknown> = { message: "Outer wrapper" };
    const wrappedError = { error: nestedError, originalError: outerError };
    outerError.cause = wrappedError;

    registry.codes.add("known_code", { message: "Known failure." });

    const appError = createAppError(outerError, { registry });
    expect(appError.type).toBe("known");
    expect(appError.originalError).toBe(outerError);
  });

  it("should stop unwrapping nested errors when maxDepth is reached", () => {
    const registry = createErrorRegistry();
    registry.codes.add("KNOWN_DEEP", { message: "Deep failure." });

    const tooDeep = { cause: { cause: { cause: { cause: { code: "KNOWN_DEEP" } } } } };
    expect(createAppError(tooDeep, { registry }).type).toBe("unknown");

    const withinLimit = { cause: { cause: { cause: { code: "KNOWN_DEEP" } } } };
    expect(createAppError(withinLimit, { registry }).type).toBe("known");
  });

  it("should allow configuring a custom maxDepth", () => {
    const registry = createErrorRegistry();
    registry.codes.add("DEEP_CODE", { message: "Deep failure" });
    const level0 = { cause: { cause: { code: "DEEP_CODE" } } };
    expect(createAppError(level0, { registry }).type).toBe("known");
    expect(createAppError(level0, { registry, maxDepth: 1 }).type).toBe("unknown");
  });

  it("should follow extra wrapper field names: err, inner, innerError", () => {
    const registry = createErrorRegistry();
    registry.codes.add("ERR_CODE", { message: "Nested err failure" });
    expect(createAppError({ err: { code: "ERR_CODE" } }, { registry }).message).toBe("Nested err failure");
    expect(createAppError({ inner: { code: "ERR_CODE" } }, { registry }).message).toBe("Nested err failure");
    expect(createAppError({ innerError: { code: "ERR_CODE" } }, { registry }).message).toBe("Nested err failure");
  });
});

describe("createAppError — nested AppError handling", () => {
  it("should preserve a nested known AppError classification when outer error does not match", () => {
    const registry = createErrorRegistry();
    registry.codes.add("known_code", { message: "Known failure.", messageKey: "error.known" });

    const nestedAppError = createAppError({ code: "known_code" }, { registry });
    const outerError = new Error("Outer wrapper", { cause: nestedAppError });

    const result = createAppError(outerError, { registry });
    expect(result.type).toBe("known");
    expect(result.message).toBe("Known failure.");
    expect(result.messageKey).toBe("error.known");
    expect(result.originalError).toBe(outerError);
  });

  it("should preserve a nested unexpected AppError classification when outer error does not match", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/unexpected match/i, { message: "Mapped unexpected" });
    const nestedUnexpected = createAppError(new Error("unexpected match"), { registry });
    const wrapper = new Error("Outer error", { cause: nestedUnexpected });

    const result = createAppError(wrapper, { registry });
    expect(result.type).toBe("unexpected");
    expect(result.message).toBe("Mapped unexpected");
    expect(result.originalError).toBe(wrapper);
  });

  it("should return existing AppError details when directly wrapping a known AppError", () => {
    const registry = createErrorRegistry();
    registry.codes.add("known_code", { message: "Known failure.", messageKey: "error.known" });
    const original = createAppError({ code: "known_code" }, { registry });
    const reWrapped = createAppError(original);
    expect(reWrapped).toBe(original);
  });

  it("should match isAppError brand on objects from other realms with the same brand symbol", () => {
    const mockAppError = { [Symbol.for("@codenhub/error/AppError")]: true };
    expect(isAppError(mockAppError)).toBe(true);
  });
});

describe("createAppError — custom registry implementations", () => {
  it("should work with a custom registry that only implements the public interface", () => {
    const customRegistry = {
      codes: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        get: (id: string) => (id === "CUSTOM_CODE" ? { message: "Custom code matched" } : undefined),
        values: () => [].values(),
      },
      names: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        get: () => undefined,
        values: () => [].values(),
      },
      messages: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        get: (msg: string) => (msg === "exact custom message" ? { message: "Custom message matched" } : undefined),
        values: () => [].values(),
      },
      prefixes: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        values: () => [{ prefix: "Custom prefix:", message: "Custom prefix matched" }],
      },
      patterns: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        values: () => [{ pattern: /custom pattern/i, message: "Custom pattern matched" }],
      },
      clear: () => {},
      merge: () => {},
    };

    expect(createAppError({ code: "CUSTOM_CODE" }, { registry: customRegistry })).toMatchObject({
      type: "known",
      message: "Custom code matched",
    });
    expect(createAppError(new Error("Custom prefix: test"), { registry: customRegistry })).toMatchObject({
      type: "known",
      message: "Custom prefix matched",
    });
    expect(createAppError(new Error("custom pattern match"), { registry: customRegistry })).toMatchObject({
      type: "unexpected",
      message: "Custom pattern matched",
    });
  });
});

describe("isAppError", () => {
  it("should return true for errors created by createAppError", () => {
    expect(isAppError(createAppError("Something failed"))).toBe(true);
  });

  it("should return false for standard errors and non-error objects", () => {
    expect(isAppError(new Error("standard"))).toBe(false);
    expect(isAppError({ message: "not an error" })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError("string")).toBe(false);
  });
});
