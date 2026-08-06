import { afterEach, describe, expect, it } from "vitest";

import { createAppError, isAppError, DEFAULT_APP_ERROR_MESSAGE, createErrorRegistry, getErrorRegistry } from "./index";
import { browserErrorRegistry } from "./registries/browser";

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

  it.each(["", ".", { code: "" }, { name: "!" }, { message: "?" }])(
    "should safely normalize empty identifier input %#",
    (input) => {
      expect(createAppError(input)).toMatchObject({
        type: "unknown",
        message: DEFAULT_APP_ERROR_MESSAGE,
      });
    },
  );

  it("should return as-is when input is already a normalized AppError", () => {
    const original = createAppError("Something failed");
    expect(createAppError(original)).toBe(original);
  });

  it("should use the active global registry by default", () => {
    getErrorRegistry().codes.add("invalid_credentials", {
      message: "Invalid email or password.",
      source: "my-app.auth",
    });

    expect(createAppError({ code: "invalid_credentials" })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
      source: "my-app.auth",
    });
  });

  it("should pass the original error as cause on the native Error", () => {
    const original = new Error("Failed");
    const appError = createAppError(original);
    expect(appError.cause).toBe(original);
  });

  it("should serialize normalized fields without the original error", () => {
    const appError = createAppError({ token: "secret-token" });

    expect(JSON.parse(JSON.stringify(appError))).toEqual({
      name: "AppError",
      message: DEFAULT_APP_ERROR_MESSAGE,
      type: "unknown",
      messageKey: null,
      source: null,
      isRetryable: false,
    });
  });

  it("should serialize the same fields regardless of own property enumerability", () => {
    const appError = createAppError({ token: "secret-token" });

    expect(appError.toJSON()).toEqual({
      name: "AppError",
      message: DEFAULT_APP_ERROR_MESSAGE,
      type: "unknown",
      messageKey: null,
      source: null,
      isRetryable: false,
    });
    expect(Object.keys(appError.toJSON())).not.toContain("stack");
  });

  it("should freeze the complete AppError instance", () => {
    const appError = createAppError("internal detail");

    expect(Object.isFrozen(appError)).toBe(true);
    expect(() => {
      (appError as { message: string }).message = "Changed";
    }).toThrow(TypeError);
  });

  it("should serialize normalized errors when the original error is cyclic", () => {
    const original: Record<string, unknown> = {};
    original.self = original;

    expect(() => JSON.stringify(createAppError(original))).not.toThrow();
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

  it("should read each classification field once per candidate", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/network failure/i, { message: "Network failure" });
    let messageReads = 0;
    const error = {
      get message(): string {
        messageReads += 1;
        return "network failure";
      },
    };

    expect(createAppError(error, { registry }).type).toBe("unexpected");
    expect(messageReads).toBe(1);
  });

  it("should ignore throwing proxy traps while normalizing unknown values", () => {
    const hostile = new Proxy(
      {},
      {
        get(): never {
          throw new Error("Getter failed.");
        },
        has(): never {
          throw new Error("Has failed.");
        },
      },
    );

    expect(() => isAppError(hostile)).not.toThrow();
    expect(isAppError(hostile)).toBe(false);
    expect(() => createAppError(hostile)).not.toThrow();
    expect(createAppError(hostile).type).toBe("unknown");
  });

  it("should reject values containing only the AppError brand", () => {
    const brandedValue = { [Symbol.for("@codenhub/error/AppError")]: true };

    expect(isAppError(brandedValue)).toBe(false);
    expect(createAppError(brandedValue).type).toBe("unknown");
  });

  it("should accept a read-only registry as a normalization option", () => {
    expect(createAppError(new DOMException("Aborted", "AbortError"), { registry: browserErrorRegistry })).toMatchObject(
      {
        type: "known",
        messageKey: "error.browser.abort",
      },
    );
  });
});

describe("createAppError — registry matching priority", () => {
  it("should classify via exact code match", () => {
    const registry = createErrorRegistry();
    registry.codes.add("invalid_credentials", { message: "Invalid email or password.", source: "my-app.auth" });
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

  it("should reject AppError-shaped values that were not created by this package", () => {
    const mockAppError = {
      [Symbol.for("@codenhub/error/AppError")]: true,
      name: "AppError",
      message: "Existing application error",
      type: "unknown",
      messageKey: null,
      source: null,
      originalError: null,
      isRetryable: false,
    };
    expect(isAppError(mockAppError)).toBe(false);
    expect(createAppError(mockAppError)).not.toBe(mockAppError);
  });
});

describe("createAppError — custom registry implementations", () => {
  it("should choose the longest matching prefix regardless of custom registry order", () => {
    const customRegistry = {
      ...createErrorRegistry(),
      prefixes: {
        values: () => [
          { prefix: "Upload failed", message: "Short match" },
          { prefix: "Upload failed: image", message: "Longest match" },
        ],
      },
    };

    expect(createAppError(new Error("Upload failed: image.png"), { registry: customRegistry })).toMatchObject({
      type: "known",
      message: "Longest match",
    });
  });

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

  it("should return false for a function value that only implements the AppError brand", () => {
    const fnError = Object.assign(() => {}, {
      [Symbol.for("@codenhub/error/AppError")]: true,
      type: "unknown",
      message: "Function error",
      messageKey: null,
      source: null,
      isRetryable: false,
    });
    expect(isAppError(fnError)).toBe(false);
  });
});

describe("createAppError — re-normalization with options", () => {
  it("should re-normalize an existing AppError using the new registry and options", () => {
    const registry1 = createErrorRegistry();
    registry1.codes.add("code1", { message: "First Registry Match", source: "reg1" });

    const registry2 = createErrorRegistry();
    registry2.codes.add("code1", { message: "Second Registry Match", source: "reg2" });

    const appError1 = createAppError({ code: "code1" }, { registry: registry1 });
    expect(appError1.message).toBe("First Registry Match");

    const appError2 = createAppError(appError1, { registry: registry2 });
    expect(appError2.message).toBe("Second Registry Match");
    expect(appError2.source).toBe("reg2");
    expect(appError2.originalError).toBe(appError1);
  });

  it("should use the new fallback message if re-normalization fails to match", () => {
    const registry = createErrorRegistry();
    const appError1 = createAppError({ code: "unregistered" });
    expect(appError1.message).toBe("An unexpected error occurred.");

    const appError2 = createAppError(appError1, { fallbackMessage: "New custom fallback", registry });
    expect(appError2.message).toBe("New custom fallback");
    expect(appError2.originalError).toBe(appError1);
  });

  it("should handle primitive non-record and non-string errors", () => {
    const registry = createErrorRegistry();
    const appError = createAppError(123, { registry });
    expect(appError.type).toBe("unknown");
    expect(appError.message).toBe("An unexpected error occurred.");
    expect(appError.originalError).toBe(123);
  });
});

describe("createAppError — appErrorFallback nested unknown AppError resolution", () => {
  it("should resolve using nested unknown AppError properties if no other match exists", () => {
    const registry = createErrorRegistry();
    const nestedUnknownAppError = createAppError(new Error("original error"), {
      fallbackMessage: "My custom unknown message",
      registry,
    });
    expect(nestedUnknownAppError.type).toBe("unknown");
    expect(nestedUnknownAppError.message).toBe("My custom unknown message");

    const wrapper = { cause: nestedUnknownAppError };
    const result = createAppError(wrapper, { registry });

    expect(result.type).toBe("unknown");
    expect(result.message).toBe("My custom unknown message");
    expect(result.originalError).toBe(wrapper);
  });

  it("should cover fallback branch when multiple nested unknown AppErrors exist", () => {
    const registry = createErrorRegistry();
    const unknown1 = createAppError("First unknown", { registry });
    const unknown2 = createAppError("Second unknown", { registry });
    const outer = { cause: unknown1, originalError: unknown2 };
    const result = createAppError(outer, { registry });
    expect(result.type).toBe("unknown");
  });

  it("should cover non-record wrapped error candidate branch", () => {
    const registry = createErrorRegistry();
    const result = createAppError({ cause: "primitive cause string" }, { registry });
    expect(result.type).toBe("unknown");
  });

  it.each([-1, 1.5, 4, Number.NaN, Number.POSITIVE_INFINITY])("should reject invalid maxDepth %s", (maxDepth) => {
    expect(() => createAppError({ cause: new Error("nested") }, { maxDepth })).toThrow(TypeError);
  });

  it("should allow maxDepth values from zero through three", () => {
    const registry = createErrorRegistry();
    registry.codes.add("nested_code", { message: "Nested error." });
    const errorWithCause = { cause: { code: "nested_code" }, message: "Outer message" };

    expect(createAppError(errorWithCause, { maxDepth: 0, registry }).type).toBe("unknown");
    expect(createAppError(errorWithCause, { maxDepth: 1, registry }).type).toBe("known");
    expect(createAppError(errorWithCause, { maxDepth: 2, registry }).type).toBe("known");
    expect(createAppError(errorWithCause, { maxDepth: 3, registry }).type).toBe("known");
  });
});

describe("createAppError — option validation", () => {
  it.each([null, "options", 42])("should reject a non-object options value %j", (options) => {
    expect(() => createAppError({ code: "any" }, options as never)).toThrow(TypeError);
  });

  it.each(["", "   ", 123, true])("should reject an invalid fallbackMessage %j", (fallbackMessage) => {
    expect(() => createAppError({ code: "any" }, { fallbackMessage } as never)).toThrow(TypeError);
  });

  it.each([null, "registry", 42, {}, []])("should reject a registry without read methods %j", (registry) => {
    expect(() => createAppError({ code: "any" }, { registry } as never)).toThrow(TypeError);
  });

  it("should reject an invalid registry even when the error carries no identifiers", () => {
    expect(() => createAppError({}, { registry: {} } as never)).toThrow(TypeError);
  });

  it("should accept a frozen read-only registry as a classification source", () => {
    expect(createAppError({ name: "AbortError" }, { registry: browserErrorRegistry })).toMatchObject({
      type: "known",
      source: "browser",
    });
  });
});
