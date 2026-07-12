import { afterEach, describe, expect, it } from "vitest";

import {
  createAppError,
  isAppError,
  DEFAULT_APP_ERROR_MESSAGE,
  createErrorRegistry,
  getErrorRegistry,
  setErrorRegistry,
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
      retryable: false,
    });
    expect(createAppError({ code: "invalid_credentials" }, { registry: secondRegistry })).toMatchObject({
      type: "unknown",
      message: DEFAULT_APP_ERROR_MESSAGE,
      messageKey: null,
      source: null,
      retryable: false,
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
    registry.patterns.addList([[/failed to fetch/i, { message: "Network request failed.", retryable: true }]]);

    expect(createAppError({ code: "email_not_confirmed" }, { registry })).toMatchObject({
      type: "known",
      message: "Email address is not confirmed.",
      source: "auth",
    });
    expect(createAppError(new Error("Failed to fetch"), { registry })).toMatchObject({
      type: "unexpected",
      message: "Network request failed.",
      retryable: true,
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
      registry.codes.add("invalid_credentials", { message: "Invalid email or password.", retryable: "yes" } as never);
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
      retryable: true,
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
      retryable: true,
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
    expect(appError.retryable).toBe(false);
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
