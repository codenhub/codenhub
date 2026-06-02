import { afterEach, describe, expect, it } from "vitest";
import AppError, { AppErrorRegistry, DEFAULT_APP_ERROR_MESSAGE } from "./index";
import * as appErrorModule from "./index";

afterEach(() => {
  AppErrorRegistry.clear();
});

describe("AppError public surface", () => {
  it("should expose registry helpers without a built-in manifest", () => {
    expect(Object.keys(appErrorModule).sort()).toEqual([
      "AppError",
      "AppErrorRegistry",
      "DEFAULT_APP_ERROR_MESSAGE",
      "default",
    ]);
  });
});

describe("AppError", () => {
  it("should resolve registered error codes", () => {
    const originalError = { code: "invalid_credentials" };

    AppErrorRegistry.codes.add("invalid_credentials", {
      message: "Invalid email or password.",
      messageKey: "error.auth.invalidCredentials",
      source: "auth",
    });

    const appError = new AppError(originalError);

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Invalid email or password.");
    expect(appError.messageKey).toBe("error.auth.invalidCredentials");
    expect(appError.source).toBe("auth");
    expect(appError.originalError).toBe(originalError);
    expect(appError.retryable).toBe(false);
  });

  it("should resolve registered names, messages, prefixes, and patterns", () => {
    AppErrorRegistry.names.add("QuotaExceededError", {
      message: "Storage full.",
      messageKey: "error.storage.full",
      source: "browser",
    });
    AppErrorRegistry.messages.add("Upload failed: The resource already exists", {
      message: "File already exists.",
    });
    AppErrorRegistry.prefixes.add("Upload failed:", {
      message: "Could not upload file.",
      messageKey: "error.upload.failed",
    });
    AppErrorRegistry.patterns.add(/timeout/i, {
      message: "Operation timed out.",
      messageKey: "error.timeout",
      retryable: true,
    });

    expect(new AppError(new DOMException("Full", "QuotaExceededError"))).toMatchObject({
      type: "known",
      message: "Storage full.",
      messageKey: "error.storage.full",
      source: "browser",
    });
    expect(new AppError(new Error("Upload failed: The resource already exists"))).toMatchObject({
      type: "known",
      message: "File already exists.",
      messageKey: null,
      source: null,
    });
    expect(new AppError(new Error("Upload failed: network issue"))).toMatchObject({
      type: "known",
      message: "Could not upload file.",
      messageKey: "error.upload.failed",
    });
    expect(new AppError(new Error("Request timeout"))).toMatchObject({
      type: "unexpected",
      message: "Operation timed out.",
      messageKey: "error.timeout",
      retryable: true,
    });
  });

  it("should be unknown without caller registrations", () => {
    const appError = new AppError({ code: "invalid_credentials", message: "Failed to fetch" });

    expect(appError.type).toBe("unknown");
    expect(appError.message).toBe(DEFAULT_APP_ERROR_MESSAGE);
    expect(appError.messageKey).toBe(null);
    expect(appError.source).toBe(null);
    expect(appError.retryable).toBe(false);
  });

  it("should resolve nested wrapper errors and avoid cycles", () => {
    const nestedError = { code: "known_code" };
    const originalError: Record<string, unknown> = { message: "Outer wrapper" };
    const wrappedError = { error: nestedError, originalError };
    originalError.cause = wrappedError;

    AppErrorRegistry.codes.add("known_code", { message: "Known failure." });

    const appError = new AppError(originalError);

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Known failure.");
    expect(appError.originalError).toBe(originalError);
  });

  it("should keep the surface classification before nested wrapper errors", () => {
    AppErrorRegistry.codes.add("nested_code", { message: "Nested failure." });
    AppErrorRegistry.prefixes.add("Upload failed:", { message: "Surface failure." });

    const appError = new AppError({ cause: { code: "nested_code" }, message: "Upload failed: network" });

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Surface failure.");
  });

  it("should resolve registered messages after punctuation normalization", () => {
    AppErrorRegistry.messages.add("Password update failed", { message: "Password failure." });

    const appError = new AppError(new Error("Password update failed!"));

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Password failure.");
  });

  it("should resolve global regular expression patterns more than once", () => {
    AppErrorRegistry.patterns.add(/failed to fetch/g, { message: "Network failure.", retryable: true });

    expect(new AppError(new Error("failed to fetch"))).toMatchObject({
      type: "unexpected",
      message: "Network failure.",
      retryable: true,
    });
    expect(new AppError(new Error("failed to fetch"))).toMatchObject({
      type: "unexpected",
      message: "Network failure.",
      retryable: true,
    });
  });

  it("should return existing AppError details when wrapping AppError", () => {
    AppErrorRegistry.codes.add("known_code", { message: "Known failure.", messageKey: "error.known" });

    const originalAppError = new AppError({ code: "known_code" });
    const appError = new AppError(originalAppError);

    expect(appError.type).toBe("known");
    expect(appError.message).toBe("Known failure.");
    expect(appError.messageKey).toBe("error.known");
    expect(appError.originalError).toBe(originalAppError.originalError);
  });
});
