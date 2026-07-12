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
} from "./index";

afterEach(() => {
  getErrorRegistry().clear();
});

describe("createErrorRegistry", () => {
  it("creates isolated blank registries", () => {
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

  it("creates registries with presets on creation", () => {
    const firstPreset = createErrorRegistry();
    firstPreset.codes.add("code_one", { message: "Message one" });
    const secondPreset = createErrorRegistry();
    secondPreset.names.add("NameTwo", { message: "Message two" });

    const mergedRegistry = createErrorRegistry([firstPreset, secondPreset]);

    expect(mergedRegistry.codes.get("code_one")).toEqual({ message: "Message one" });
    expect(mergedRegistry.names.get("NameTwo")).toEqual({ message: "Message two" });
  });

  it("adds multiple mappings from tuple lists", () => {
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

  it("keeps bucket addList callable when destructured", () => {
    const registry = createErrorRegistry();
    const addList = registry.codes.addList;

    addList([["invalid_credentials", { message: "Invalid email or password.", source: "auth" }]]);

    expect(createAppError({ code: "invalid_credentials" }, { registry })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
      source: "auth",
    });
  });

  it("keeps registry merge and clear callable when destructured", () => {
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

  it("rejects empty exact-match identifiers", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.codes.add("   ", { message: "Invalid email or password." });
    }).toThrow(TypeError);
  });

  it("rejects prefixes that normalize to empty strings", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.prefixes.add("!!!", { message: "Invalid email or password." });
    }).toThrow(TypeError);
  });

  it("rejects feedback without a non-empty message", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.codes.add("invalid_credentials", {} as never);
    }).toThrow(TypeError);
  });

  it("rejects invalid optional feedback fields", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.codes.add("invalid_credentials", { message: "Invalid email or password.", isRetryable: "yes" } as never);
    }).toThrow(TypeError);
  });

  it("rejects non-RegExp patterns", () => {
    const registry = createErrorRegistry();

    expect(() => {
      registry.patterns.add("failed to fetch" as never, { message: "Network request failed." });
    }).toThrow(TypeError);
  });

  it("matches exact identifiers after registry normalization", () => {
    const registry = createErrorRegistry();

    registry.codes.add(" invalid_credentials. ", { message: "Invalid email or password." });

    expect(registry.codes.get("invalid_credentials")).toEqual({ message: "Invalid email or password." });
    expect(createAppError({ code: "invalid_credentials" }, { registry })).toMatchObject({
      type: "known",
      message: "Invalid email or password.",
    });
  });

  it("merges mappings from ready or app-owned registries", () => {
    const sourceRegistry = createErrorRegistry();
    const targetRegistry = createErrorRegistry();

    sourceRegistry.names.add("AbortError", {
      message: "Request cancelled.",
      source: "browser",
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
  it("gets and sets global active registry", () => {
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

  it("rejects non-object registry in setter", () => {
    expect(() => setErrorRegistry(null as never)).toThrow(TypeError);
    expect(() => setErrorRegistry("not-a-registry" as never)).toThrow(TypeError);
  });
});

describe("createAppError", () => {
  it("starts from a blank default registry", () => {
    const appError = createAppError({ code: "invalid_credentials", message: "Failed to fetch" });

    expect(appError.type).toBe("unknown");
    expect(appError.message).toBe(DEFAULT_APP_ERROR_MESSAGE);
    expect(appError.messageKey).toBe(null);
    expect(appError.source).toBe(null);
    expect(appError.isRetryable).toBe(false);
  });

  it("uses active registry by default", () => {
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

  it("resolves nested wrapper errors without following cycles forever", () => {
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

  it("does not throw when unknown error fields have throwing accessors", () => {
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

  it("normalizes function-based errors", () => {
    const registry = createErrorRegistry();
    registry.codes.add("FUNC_ERROR", { message: "Function failed." });

    const errorFn = Object.assign(() => {}, { code: "FUNC_ERROR" });
    const appError = createAppError(errorFn, { registry });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Function failed.");
    expect(appError.originalError).toBe(errorFn);
  });

  it("keeps surface classifications before nested wrapper errors", () => {
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

  it("uses the longest matching prefix when prefixes overlap", () => {
    const registry = createErrorRegistry();

    registry.prefixes.add("Upload failed", { message: "Upload failed." });
    registry.prefixes.add("Upload failed: image", { message: "Image upload failed." });

    const appError = createAppError(new Error("Upload failed: image too large"), { registry });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Image upload failed.");
  });

  it("returns existing AppError details when wrapping AppError", () => {
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
  it("returns true for errors created by createAppError", () => {
    const error = createAppError("Something failed");
    expect(isAppError(error)).toBe(true);
  });

  it("returns false for standard errors or other objects", () => {
    expect(isAppError(new Error("standard"))).toBe(false);
    expect(isAppError({ message: "not an error" })).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("result helpers", () => {
  it("creates success and failure results", () => {
    const registry = createErrorRegistry();
    const success = ok("user-id");

    registry.codes.add("invalid_credentials", { message: "Invalid email or password." });

    const failure = err({ code: "invalid_credentials" }, { registry });

    expect(success).toEqual({ ok: true, value: "user-id" } satisfies Result<string>);
    expect(failure.ok).toBe(false);
    expect(failure.error.message).toBe("Invalid email or password.");
  });

  it("uses string errors as fallback messages", () => {
    const failure = err("Missing user id");

    expect(failure.error.type).toBe("unknown");
    expect(failure.error.message).toBe("Missing user id");
  });
});

describe("refactored error features", () => {
  it("coerces numeric code to string in normalizeError", () => {
    const registry = createErrorRegistry();
    registry.codes.add("500", { message: "Internal server error." });

    const appError = createAppError({ code: 500 }, { registry });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Internal server error.");
  });

  it("passes the original error as cause to the native Error constructor", () => {
    const original = new Error("Failed");
    const appError = createAppError(original);

    expect(appError.cause).toBe(original);
  });

  it("deletes entries from all registry buckets", () => {
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

  it("throws TypeError when attempting to mutate a frozen registry", () => {
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
  });

  it("prioritizes known classifications in nested candidates over unexpected pattern matches", () => {
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
});
