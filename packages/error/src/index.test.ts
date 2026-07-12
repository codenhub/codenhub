import { afterEach, describe, expect, it } from "vitest";

import {
  createAppError,
  isAppError,
  DEFAULT_APP_ERROR_MESSAGE,
  createErrorRegistry,
  getErrorRegistry,
  setErrorRegistry,
  freezeRegistry,
  err,
  ok,
  type Result,
  type ErrorRegistry,
  type ErrorRegistryBucket,
  type ErrorPrefixRegistryBucket,
  type ErrorPatternRegistryBucket,
} from "./index";
import { RAW_ENTRIES_SYMBOL } from "./registry";

afterEach(() => {
  getErrorRegistry().clear();
});

describe("createErrorRegistry", () => {
  it("should create isolated blank registries", () => {
    const firstRegistry = createErrorRegistry();
    const secondRegistry = createErrorRegistry();

    firstRegistry.codes.add("invalid_credentials", {
      message: "Invalid email or password.",
      messageKey: "error.auth.invalidCredentials",
      source: "auth",
    });

    expect(createAppError({ code: "invalid_credentials" }, { registry: firstRegistry })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
      messageKey: "error.auth.invalidCredentials",
      source: "auth",
      isRetryable: false,
    });
    expect(createAppError({ code: "invalid_credentials" }, { registry: secondRegistry })).toMatchObject({
      type: "unknown",
      message: DEFAULT_APP_ERROR_MESSAGE,
      messageKey: null,
      source: null,
      isRetryable: false,
    });
  });

  it("should create registries with presets on creation", () => {
    const firstPreset = createErrorRegistry();
    firstPreset.codes.add("code_one", { message: "Message one" });
    const secondPreset = createErrorRegistry();
    secondPreset.names.add("NameTwo", { message: "Message two" });

    const mergedRegistry = createErrorRegistry([firstPreset, secondPreset]);

    expect(mergedRegistry.codes.get("code_one")).toEqual({ message: "Message one" });
    expect(mergedRegistry.names.get("NameTwo")).toEqual({ message: "Message two" });
  });

  it("should add multiple mappings from tuple lists", () => {
    const registry = createErrorRegistry();

    registry.codes.addList([
      ["invalid_credentials", { message: "Invalid email or password.", source: "auth" }],
      ["email_not_confirmed", { message: "Email address is not confirmed.", source: "auth" }],
    ]);
    registry.patterns.addList([[/failed to fetch/i, { message: "Network request failed.", isRetryable: true }]]);

    expect(createAppError({ code: "email_not_confirmed" }, { registry })).toMatchObject({
      type: "known",
      message: "Email address is not confirmed.",
      source: "auth",
    });
    expect(createAppError(new Error("Failed to fetch"), { registry })).toMatchObject({
      type: "unexpected",
      message: "Network request failed.",
      isRetryable: true,
    });
  });

  it("should keep bucket addList callable when destructured", () => {
    const registry = createErrorRegistry();
    const addList = registry.codes.addList;

    addList([["invalid_credentials", { message: "Invalid email or password.", source: "auth" }]]);

    expect(createAppError({ code: "invalid_credentials" }, { registry })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
      source: "auth",
    });
  });

  it("should keep registry merge and clear callable when destructured", () => {
    const sourceRegistry = createErrorRegistry();
    const targetRegistry = createErrorRegistry();
    const merge = targetRegistry.merge;
    const clear = targetRegistry.clear;

    sourceRegistry.codes.add("invalid_credentials", { message: "Invalid email or password.", source: "auth" });

    merge(sourceRegistry);

    expect(createAppError({ code: "invalid_credentials" }, { registry: targetRegistry })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
    });

    clear();

    expect(createAppError({ code: "invalid_credentials" }, { registry: targetRegistry })).toMatchObject({
      type: "unknown",
      message: DEFAULT_APP_ERROR_MESSAGE,
    });
  });

  it("should reject empty exact-match identifiers", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.codes.add("   ", { message: "Invalid email or password." });
    }).toThrow(TypeError);
  });

  it("should reject prefixes that normalize to empty strings", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.prefixes.add("!!!", { message: "Invalid email or password." });
    }).toThrow(TypeError);
  });

  it("should reject feedback without a non-empty message", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.codes.add("invalid_credentials", {} as never);
    }).toThrow(TypeError);
  });

  it("should reject invalid optional feedback fields", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.codes.add("invalid_credentials", null as never);
    }).toThrow(TypeError);

    expect(() => {
      registry.codes.add("invalid_credentials", { message: "Msg", messageKey: 123 } as never);
    }).toThrow(TypeError);

    expect(() => {
      registry.codes.add("invalid_credentials", { message: "Msg", source: 123 } as never);
    }).toThrow(TypeError);

    expect(() => {
      registry.codes.add("invalid_credentials", { message: "Invalid email or password.", isRetryable: "yes" } as never);
    }).toThrow(TypeError);
  });

  it("should reject non-RegExp patterns", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.patterns.add("failed to fetch" as never, { message: "Network request failed." });
    }).toThrow(TypeError);
  });

  it("should match exact identifiers after registry normalization", () => {
    const registry = createErrorRegistry();

    registry.codes.add(" invalid_credentials. ", { message: "Invalid email or password." });

    expect(registry.codes.get("invalid_credentials")).toEqual({ message: "Invalid email or password." });
    expect(createAppError({ code: "invalid_credentials" }, { registry })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
    });
  });

  it("should merge mappings from ready or app-owned registries", () => {
    const sourceRegistry = createErrorRegistry();
    const targetRegistry = createErrorRegistry();

    sourceRegistry.codes.add("500", {
      message: "Internal server error.",
      source: "server",
    });
    sourceRegistry.names.add("AbortError", {
      message: "Request cancelled.",
      source: "browser",
    });
    sourceRegistry.messages.add("Exact message to match", {
      message: "Matched message",
    });
    sourceRegistry.prefixes.add("Upload failed:", {
      message: "Surface failure.",
    });
    sourceRegistry.patterns.add(/failed to fetch/gi, {
      message: "Network request failed.",
      source: "browser",
      isRetryable: true,
    });

    targetRegistry.merge(sourceRegistry);
    sourceRegistry.clear();

    expect(createAppError(new DOMException("Aborted", "AbortError"), { registry: targetRegistry })).toMatchObject({
      type: "known",
      message: "Request cancelled.",
      source: "browser",
    });
    expect(createAppError(new Error("failed to fetch"), { registry: targetRegistry })).toMatchObject({
      type: "unexpected",
      message: "Network request failed.",
      isRetryable: true,
    });
  });
});

describe("global registry getter/setter", () => {
  it("should get and set global active registry", () => {
    const defaultRegistry = getErrorRegistry();
    const customRegistry = createErrorRegistry();
    customRegistry.codes.add("code_one", { message: "Custom message" });

    setErrorRegistry(customRegistry);
    expect(getErrorRegistry()).toBe(customRegistry);

    expect(createAppError({ code: "code_one" })).toMatchObject({
      type: "known",
      message: "Custom message",
    });

    setErrorRegistry(defaultRegistry);
  });

  it("should reject non-object registry in setter", () => {
    expect(() => setErrorRegistry(null as never)).toThrow(TypeError);
    expect(() => setErrorRegistry("not-a-registry" as never)).toThrow(TypeError);
  });
});

describe("createAppError", () => {
  it("should start from a blank default registry", () => {
    const appError = createAppError({ code: "invalid_credentials", message: "Failed to fetch" });

    expect(appError.type).toBe("unknown");
    expect(appError.message).toBe(DEFAULT_APP_ERROR_MESSAGE);
    expect(appError.messageKey).toBe(null);
    expect(appError.source).toBe(null);
    expect(appError.isRetryable).toBe(false);
  });

  it("should use active registry by default", () => {
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

  it("should resolve nested wrapper errors without following cycles forever", () => {
    const registry = createErrorRegistry();
    const nestedError = { code: "known_code" };
    const originalError: Record<string, unknown> = { message: "Outer wrapper" };
    const wrappedError = { error: nestedError, originalError };
    originalError.cause = wrappedError;

    registry.codes.add("known_code", { message: "Known failure." });

    const appError = createAppError(originalError, { registry });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Known failure.");
    expect(appError.originalError).toBe(originalError);
  });

  it("should not throw when unknown error fields have throwing accessors", () => {
    const error = {
      get message(): string {
        throw new Error("Getter failed.");
      },
    };

    expect(() => createAppError(error)).not.toThrow();

    const appError = createAppError(error);

    expect(appError.type).toBe("unknown");
    expect(appError.message).toBe(DEFAULT_APP_ERROR_MESSAGE);
    expect(appError.originalError).toBe(error);
  });

  it("should normalize function-based errors", () => {
    const registry = createErrorRegistry();
    registry.codes.add("FUNC_ERROR", { message: "Function failed." });

    const errorFn = Object.assign(() => {}, { code: "FUNC_ERROR" });
    const appError = createAppError(errorFn, { registry });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Function failed.");
    expect(appError.originalError).toBe(errorFn);
  });

  it("should keep surface classifications before nested wrapper errors", () => {
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

  it("should use the longest matching prefix when prefixes overlap", () => {
    const registry = createErrorRegistry();

    registry.prefixes.add("Upload failed", { message: "Upload failed." });
    registry.prefixes.add("Upload failed: image", { message: "Image upload failed." });

    const appError = createAppError(new Error("Upload failed: image too large"), { registry });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Image upload failed.");
  });

  it("should return existing AppError details when wrapping AppError", () => {
    const registry = createErrorRegistry();

    registry.codes.add("known_code", { message: "Known failure.", messageKey: "error.known" });

    const originalAppError = createAppError({ code: "known_code" }, { registry });
    const appError = createAppError(originalAppError);

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Known failure.");
    expect(appError.messageKey).toBe("error.known");
    expect(appError.originalError).toBe(originalAppError.originalError);
  });
});

describe("isAppError", () => {
  it("should return true for errors created by createAppError", () => {
    const error = createAppError("Something failed");
    expect(isAppError(error)).toBe(true);
  });

  it("should return false for standard errors or other objects", () => {
    expect(isAppError(new Error("standard"))).toBe(false);
    expect(isAppError({ message: "not an error" })).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("result helpers", () => {
  it("should create success and failure results", () => {
    const registry = createErrorRegistry();
    const success = ok("user-id");

    registry.codes.add("invalid_credentials", { message: "Invalid email or password." });

    const failure = err({ code: "invalid_credentials" }, { registry });

    expect(success).toEqual({ ok: true, value: "user-id" } satisfies Result<string>);
    expect(failure.ok).toBe(false);
    expect(failure.error.message).toBe("Invalid email or password.");
  });

  it("should use string errors as fallback messages", () => {
    const failure = err("Missing user id");

    expect(failure.error.type).toBe("unknown");
    expect(failure.error.message).toBe("Missing user id");
  });
});

describe("refactored error features", () => {
  it("should coerce numeric code to string in normalizeError", () => {
    const registry = createErrorRegistry();
    registry.codes.add("500", { message: "Internal server error." });

    const appError = createAppError({ code: 500 }, { registry });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Internal server error.");
  });

  it("should pass the original error as cause to the native Error constructor", () => {
    const original = new Error("Failed");
    const appError = createAppError(original);

    expect(appError.cause).toBe(original);
  });

  it("should delete entries from all registry buckets", () => {
    const registry = createErrorRegistry();

    // codes bucket delete
    registry.codes.add("code1", { message: "Message 1" });
    expect(registry.codes.get("code1")).toBeDefined();
    expect(registry.codes.delete("code1")).toBe(true);
    expect(registry.codes.get("code1")).toBeUndefined();
    expect(registry.codes.delete("code1")).toBe(false);

    // prefixes bucket delete
    registry.prefixes.add("Upload failed", { message: "Failed upload" });
    expect(registry.prefixes.values().length).toBe(1);
    expect(registry.prefixes.delete("Upload failed")).toBe(true);
    expect(registry.prefixes.values().length).toBe(0);
    expect(registry.prefixes.delete("Upload failed")).toBe(false);

    // patterns bucket delete
    const pattern = /network/i;
    registry.patterns.add(pattern, { message: "Network error" });
    expect(registry.patterns.values().length).toBe(1);
    expect(registry.patterns.delete(pattern)).toBe(true);
    expect(registry.patterns.values().length).toBe(0);
    expect(registry.patterns.delete(pattern)).toBe(false);
  });

  it("should throw TypeError when attempting to mutate a frozen registry", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    expect(() => frozen.codes.add("code", { message: "err" })).toThrow(TypeError);
    expect(() => frozen.codes.addList([["code", { message: "err" }]])).toThrow(TypeError);
    expect(() => frozen.codes.clear()).toThrow(TypeError);
    expect(() => frozen.codes.delete("code")).toThrow(TypeError);

    expect(() => frozen.prefixes.add("prefix", { message: "err" })).toThrow(TypeError);
    expect(() => frozen.prefixes.addList([["prefix", { message: "err" }]])).toThrow(TypeError);
    expect(() => frozen.prefixes.clear()).toThrow(TypeError);
    expect(() => frozen.prefixes.delete("prefix")).toThrow(TypeError);

    expect(() => frozen.patterns.add(/p/, { message: "err" })).toThrow(TypeError);
    expect(() => frozen.patterns.addList([[/p/, { message: "err" }]])).toThrow(TypeError);
    expect(() => frozen.patterns.clear()).toThrow(TypeError);
    expect(() => frozen.patterns.delete(/p/)).toThrow(TypeError);

    expect(() => frozen.clear()).toThrow(TypeError);
    expect(() => frozen.merge(registry)).toThrow(TypeError);

    expect(() => {
      (frozen as unknown as Record<string, unknown>).codes = registry.codes;
    }).toThrow(TypeError);

    // Verify RAW_ENTRIES_SYMBOL map/array is read-only
    const rawCodes = (frozen.codes as unknown as Record<symbol, unknown>)[RAW_ENTRIES_SYMBOL] as Map<unknown, unknown>;
    expect(() => rawCodes.set("code", { message: "err" })).toThrow(TypeError);
    expect(() => rawCodes.delete("code")).toThrow(TypeError);
    expect(() => rawCodes.clear()).toThrow(TypeError);

    const rawPrefixes = (frozen.prefixes as unknown as Record<symbol, unknown>)[RAW_ENTRIES_SYMBOL] as Map<
      unknown,
      unknown
    >;
    expect(() => rawPrefixes.set("prefix", { message: "err" })).toThrow(TypeError);
    expect(() => rawPrefixes.delete("prefix")).toThrow(TypeError);
    expect(() => rawPrefixes.clear()).toThrow(TypeError);

    const rawPatterns = (frozen.patterns as unknown as Record<symbol, unknown>)[RAW_ENTRIES_SYMBOL] as unknown[];
    expect(() => rawPatterns.push({ pattern: /p/, message: "err" })).toThrow(TypeError);
    expect(() => {
      rawPatterns[0] = { pattern: /p/, message: "err" };
    }).toThrow(TypeError);
  });

  it("should prioritize known classifications in nested candidates over unexpected pattern matches", () => {
    const registry = createErrorRegistry();

    registry.patterns.add(/network error/i, { message: "Generic network failure." });
    registry.codes.add("AUTH_EXPIRED", { message: "Auth expired, please log in again." });

    // Outer error has message matching pattern (which is unexpected / heuristic)
    // Inner error (cause) has code matching codes (which is known / deterministic)
    const nestedError = { code: "AUTH_EXPIRED" };
    const outerError = new Error("Generic network error occurred", { cause: nestedError });

    const appError = createAppError(outerError, { registry });

    // Should prioritize the known/deterministic AUTH_EXPIRED match over the generic unexpected regex match
    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Auth expired, please log in again.");
  });

  it("should replace duplicate prefixes in prefix bucket on add", () => {
    const registry = createErrorRegistry();
    registry.prefixes.add("Upload failed:", { message: "First message" });
    registry.prefixes.add("Upload failed:", { message: "Replaced message" });

    const values = registry.prefixes.values();
    expect(values.length).toBe(1);
    expect(values[0]).toMatchObject({
      prefix: "Upload failed:",
      message: "Replaced message",
    });
  });

  it("should replace duplicate patterns in pattern bucket on add", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/network error/i, { message: "First message" });
    registry.patterns.add(/network error/i, { message: "Replaced message" });

    const values = registry.patterns.values();
    expect(values.length).toBe(1);
    expect(values[0]).toMatchObject({
      pattern: /network error/i,
      message: "Replaced message",
    });
  });

  it("should preserve nested AppError resolved classification details during candidate evaluation", () => {
    const registry = createErrorRegistry();

    registry.patterns.add(/network error/i, { message: "Generic network failure." });
    registry.codes.add("AUTH_EXPIRED", {
      message: "Auth expired, please log in again.",
      messageKey: "error.auth.expired",
      source: "auth",
    });

    // Inner is already a normalized known AppError
    const nestedAppError = createAppError({ code: "AUTH_EXPIRED" }, { registry });
    // Outer is a generic Error wrapping it
    const outerError = new Error("Generic network error occurred", { cause: nestedAppError });

    const appError = createAppError(outerError, { registry });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Auth expired, please log in again.");
    expect(appError.messageKey).toBe("error.auth.expired");
    expect(appError.source).toBe("auth");
  });

  it("should strip global and sticky flags from RegExp patterns to prevent stateful matching", () => {
    const registry = createErrorRegistry();
    // Register with global flag
    registry.patterns.add(/test-error/g, { message: "Test pattern error" });

    // Stored pattern should have g flag stripped
    const definitions = registry.patterns.values();
    expect(definitions[0].pattern.flags).not.toContain("g");

    // Multiple calls should consistently match (not alternate due to lastIndex state)
    const err1 = createAppError(new Error("test-error value"), { registry });
    const err2 = createAppError(new Error("test-error value"), { registry });
    const err3 = createAppError(new Error("test-error value"), { registry });

    expect(err1.type).toBe("unexpected");
    expect(err2.type).toBe("unexpected");
    expect(err3.type).toBe("unexpected");

    // Delete should also work with global/sticky regex
    expect(registry.patterns.delete(/test-error/g)).toBe(true);
    expect(registry.patterns.values().length).toBe(0);
  });

  it("should prevent advanced mutations on frozen registries via deleteProperty, defineProperty, preventExtensions, setPrototypeOf", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    expect(() => {
      delete (frozen.codes as unknown as Record<string, unknown>).add;
    }).toThrow(TypeError);

    expect(() => {
      Object.defineProperty(frozen.codes, "newProp", { value: "val" });
    }).toThrow(TypeError);

    expect(() => {
      Object.preventExtensions(frozen.codes);
    }).toThrow(TypeError);

    expect(() => {
      Object.setPrototypeOf(frozen.codes, {});
    }).toThrow(TypeError);

    // Also verify on raw entries proxy
    const rawCodes = (frozen.codes as unknown as Record<symbol, Record<string, unknown>>)[RAW_ENTRIES_SYMBOL];
    expect(() => {
      delete rawCodes.set;
    }).toThrow(TypeError);

    expect(() => {
      Object.defineProperty(rawCodes, "newProp", { value: "val" });
    }).toThrow(TypeError);
  });

  it("should support custom registry implementation without internal symbols", () => {
    // Custom registry that only implements the ErrorRegistry interface without [RAW_ENTRIES_SYMBOL]
    const customRegistry: ErrorRegistry = {
      codes: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        get: (id: string) => (id === "CUSTOM_CODE" ? { message: "Custom code matched" } : undefined),
        values: () => [].values(),
      } as unknown as ErrorRegistryBucket,
      names: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        get: (name: string) => (name === "CustomNameError" ? { message: "Custom name matched" } : undefined),
        values: () => [].values(),
      } as unknown as ErrorRegistryBucket,
      messages: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        get: (msg: string) => (msg === "custom message" ? { message: "Custom message matched" } : undefined),
        values: () => [].values(),
      } as unknown as ErrorRegistryBucket,
      prefixes: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        values: () => [{ prefix: "Custom prefix:", message: "Custom prefix matched" }],
      } as unknown as ErrorPrefixRegistryBucket,
      patterns: {
        add: () => {},
        addList: () => {},
        clear: () => {},
        delete: () => false,
        values: () => [{ pattern: /custom pattern/i, message: "Custom pattern matched" }],
      } as unknown as ErrorPatternRegistryBucket,
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

  it("should traverse and classify nested AppError wrappers of type unexpected or unknown", () => {
    const registry = createErrorRegistry();

    // Create an unexpected nested AppError
    registry.patterns.add(/unexpected match/i, { message: "Mapped unexpected" });
    const nestedUnexpected = createAppError(new Error("unexpected match"), { registry });
    expect(nestedUnexpected.type).toBe("unexpected");

    // Wrap it in a new error
    const wrapper = new Error("Outer error", { cause: nestedUnexpected });
    const resultAppError = createAppError(wrapper, { registry });

    expect(resultAppError.type).toBe("unexpected");
    expect(resultAppError.message).toBe("Mapped unexpected");
    expect(resultAppError.originalError).toBe(wrapper);

    // Create an unknown nested AppError wrapper
    const nestedUnknown = createAppError(new Error("completely unknown error"), { registry });
    expect(nestedUnknown.type).toBe("unknown");

    const wrapperUnknown = new Error("Outer error", { cause: nestedUnknown });
    const resultUnknownAppError = createAppError(wrapperUnknown, { registry });

    expect(resultUnknownAppError.type).toBe("unknown");
    expect(resultUnknownAppError.message).toBe(DEFAULT_APP_ERROR_MESSAGE);
  });

  it("should match exact message mappings in the messages bucket", () => {
    const registry = createErrorRegistry();
    registry.messages.add("Exact message to match", { message: "Matched exact message" });

    const appError = createAppError(new Error("Exact message to match"), { registry });
    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Matched exact message");
  });

  it("should throw TypeError when non-RegExp passed to patterns bucket delete", () => {
    const registry = createErrorRegistry();
    expect(() => {
      registry.patterns.delete("not-a-regex" as unknown as RegExp);
    }).toThrow(TypeError);
  });

  it("should support prefix bucket addList method", () => {
    const registry = createErrorRegistry();
    registry.prefixes.addList([
      ["First prefix:", { message: "First message" }],
      ["Second prefix:", { message: "Second message" }],
    ]);

    expect(createAppError(new Error("First prefix: something"), { registry }).message).toBe("First message");
    expect(createAppError(new Error("Second prefix: something"), { registry }).message).toBe("Second message");
  });

  it("should stop unwrapping nested errors when max depth is reached", () => {
    const registry = createErrorRegistry();
    registry.codes.add("KNOWN_DEEP", { message: "Should not match if too deep" });

    // Depth 0: level0, Depth 1: level1, Depth 2: level2, Depth 3: level3, Depth 4: level4
    // level4 (depth 4) is too deep because max unwrap depth is 3.
    const level4 = { code: "KNOWN_DEEP" };
    const level3 = { cause: level4 };
    const level2 = { cause: level3 };
    const level1 = { cause: level2 };
    const level0 = { cause: level1 };

    const appError = createAppError(level0, { registry });
    expect(appError.type).toBe("unknown");

    // Depth 3 (within max unwrap depth 3) should match
    const withinLimit = { cause: { cause: { cause: { code: "KNOWN_DEEP" } } } };
    const appErrorMatch = createAppError(withinLimit, { registry });
    expect(appErrorMatch.type).toBe("known");
  });

  it("should throw TypeError when defineProperty, deleteProperty, defineProperty, or deleteProperty is called on frozen arrays/maps", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    // Test normal property assignment (set trap) on bucket proxy
    expect(() => {
      (frozen.codes as unknown as Record<string, unknown>).foo = "bar";
    }).toThrow(TypeError);

    const rawCodes = (frozen.codes as unknown as Record<symbol, unknown>)[RAW_ENTRIES_SYMBOL];
    // Call non-mutating method/read on map proxy (covers Reflect.get in freezeMap)
    expect((rawCodes as unknown as Map<string, unknown>).size).toBe(0);
    expect((rawCodes as unknown as Map<string, unknown>).get("any_key")).toBeUndefined();

    // Test mutations on map proxy
    expect(() => {
      (rawCodes as unknown as Record<string, unknown>).foo = "bar";
    }).toThrow(TypeError);

    expect(() => {
      delete (rawCodes as unknown as Record<string, unknown>).foo;
    }).toThrow(TypeError);

    const rawPatterns = (frozen.patterns as unknown as Record<symbol, unknown>)[RAW_ENTRIES_SYMBOL];
    expect(() => {
      delete (rawPatterns as unknown as unknown[])[0];
    }).toThrow(TypeError);

    expect(() => {
      Object.defineProperty(rawPatterns, "newProp", { value: "val" });
    }).toThrow(TypeError);

    // Call non-mutating method on array proxy (covers Reflect.get in freezeArray)
    expect((rawPatterns as unknown as unknown[]).length).toBe(0);
    expect((rawPatterns as unknown as unknown[]).find(() => true)).toBeUndefined();
  });

  it("should cover non-record error normalization and custom registry message fallback lookup", () => {
    const customRegistry: ErrorRegistry = {
      codes: { get: () => undefined } as unknown as ErrorRegistryBucket,
      names: { get: () => undefined } as unknown as ErrorRegistryBucket,
      messages: {
        get: (msg: string) => (msg === "exact custom message" ? { message: "matched message" } : undefined),
      } as unknown as ErrorRegistryBucket,
      prefixes: {
        values: () => [
          { prefix: "upload failed", message: "Longer prefix" },
          { prefix: "upload", message: "Shorter prefix" },
        ],
      } as unknown as ErrorPrefixRegistryBucket,
      patterns: { values: () => [] } as unknown as ErrorPatternRegistryBucket,
      clear: () => {},
      merge: () => {},
    };

    // Test non-record (boolean) normalization
    const appErrorBoolean = createAppError(true, { registry: customRegistry });
    expect(appErrorBoolean.type).toBe("unknown");

    // Test non-record wrapped error candidate cause (covers line 109 of normalize.ts)
    const appErrorNonRecordWrapped = createAppError({ cause: 123 }, { registry: customRegistry });
    expect(appErrorNonRecordWrapped.type).toBe("unknown");

    // Test custom registry messages fallback lookup
    const appErrorMessage = createAppError(new Error("exact custom message"), { registry: customRegistry });
    expect(appErrorMessage.type).toBe("known");
    expect(appErrorMessage.message).toBe("matched message");

    // Test custom registry prefix fallback lookup (covers false branch of length comparison)
    const appErrorPrefix = createAppError(new Error("upload failed: something"), { registry: customRegistry });
    expect(appErrorPrefix.type).toBe("known");
    expect(appErrorPrefix.message).toBe("Longer prefix");
  });
});
