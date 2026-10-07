import { describe, expect, it } from "vitest";

import { createAppError, createErrorRegistry } from "../index";
import {
  browserErrorRegistry,
  nodeErrorCodes,
  nodeErrorPatterns,
  nodeErrorRegistry,
  supabaseErrorRegistry,
  browserErrorNames,
  browserErrorPatterns,
  supabaseErrorCodes,
  supabaseErrorNames,
} from "./index";

describe("ready registries", () => {
  it("should export browser and supabase registries without mutating the default registry", () => {
    expect(createAppError(new DOMException("Aborted", "AbortError"))).toMatchObject({
      type: "unknown",
    });
    expect(createAppError({ code: "invalid_credentials" })).toMatchObject({
      type: "unknown",
    });

    const registry = createErrorRegistry([browserErrorRegistry, supabaseErrorRegistry]);

    expect(createAppError(new DOMException("Aborted", "AbortError"), { registry })).toMatchObject({
      type: "known",
      messageKey: "error.browser.abort",
      source: "browser",
      isRetryable: false,
    });
    expect(createAppError({ code: "invalid_credentials" }, { registry })).toMatchObject({
      type: "known",
      messageKey: "error.supabase.auth.invalidCredentials",
      source: "supabase.auth",
      isRetryable: false,
    });
  });

  it("should export raw dictionaries containing expected keys", () => {
    expect(browserErrorNames.AbortError).toBeDefined();
    expect(browserErrorPatterns.length).toBeGreaterThan(0);
    expect(supabaseErrorCodes.invalid_credentials).toBeDefined();
    expect(supabaseErrorNames.FunctionsHttpError).toBeDefined();
  });

  it("should provide stable message keys for consumer-owned translations", () => {
    const presetFeedback = [
      ...Object.values(browserErrorNames),
      ...browserErrorPatterns.map(([, feedback]) => feedback),
      ...Object.values(supabaseErrorCodes),
      ...Object.values(supabaseErrorNames),
    ];

    expect(presetFeedback.every((feedback) => typeof feedback.messageKey === "string")).toBe(true);
  });

  it("should follow the repository's messageKey and source conventions", () => {
    // The registry accepts any non-empty string, so the conventions of docs/specs/errors.md
    // are held here for the built-in presets instead.
    const presetFeedback = [
      ...Object.values(browserErrorNames),
      ...browserErrorPatterns.map(([, feedback]) => feedback),
      ...Object.values(supabaseErrorCodes),
      ...Object.values(supabaseErrorNames),
    ];

    for (const feedback of presetFeedback) {
      expect(feedback.messageKey).toMatch(/^error(?:\.[a-z][A-Za-z0-9]*)+$/);
      expect(feedback.source).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/);
    }
  });

  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "should classify the failed-fetch message %j",
    (message) => {
      expect(createAppError(new TypeError(message), { registry: browserErrorRegistry })).toMatchObject({
        type: "unexpected",
        messageKey: "error.browser.requestFailed",
      });
    },
  );

  it("should classify a stale code-split chunk by the bundler's name and by Chrome's message", () => {
    const chromeFailure = new TypeError(
      "Failed to fetch dynamically imported module: https://example.com/missing-chunk.js",
    );

    expect(createAppError({ name: "ChunkLoadError" }, { registry: browserErrorRegistry })).toMatchObject({
      type: "known",
      messageKey: "error.browser.moduleLoadFailed",
      isRetryable: false,
    });
    expect(createAppError(chromeFailure, { registry: browserErrorRegistry })).toMatchObject({
      type: "unexpected",
      messageKey: "error.browser.moduleLoadFailed",
      isRetryable: false,
    });
  });

  it.each(["NotReadableError", "EncodingError"])("should classify the %s name", (name) => {
    expect(createAppError(new DOMException("raw", name), { registry: browserErrorRegistry })).toMatchObject({
      type: "known",
      code: name,
    });
  });

  it("should not tell a reader who dismissed a prompt to change the site settings", () => {
    expect(browserErrorNames.NotAllowedError.message).not.toMatch(/settings/i);
  });

  it("should say only what the NotFoundError and NotAllowedError names prove", () => {
    // NotFoundError is also what a failed removeChild throws, and NotAllowedError what blocked
    // autoplay throws, where no file or device is missing and no prompt will be shown.
    expect(browserErrorNames.NotFoundError.message).not.toMatch(/file|device/i);
    expect(browserErrorNames.NotAllowedError.message).not.toMatch(/when asked/i);
  });

  it("should not classify unrelated text that mentions a failed load", () => {
    expect(createAppError(new Error("Config load failed: invalid JSON"), { registry: browserErrorRegistry }).type).toBe(
      "unknown",
    );
  });

  // Keying the maps by their identifiers was weighed and left out: it catches a misspelled
  // identifier, but a lookup by `error.code` or `error.name`, which are strings, stops compiling.
  it("should preserve string-keyed access to raw mappings", () => {
    const browserName: string = "AbortError";
    const supabaseCode: string = "invalid_credentials";

    expect(browserErrorNames[browserName]).toBeDefined();
    expect(supabaseErrorCodes[supabaseCode]).toBeDefined();
  });

  it("should deeply freeze raw preset mappings", () => {
    expect(Object.isFrozen(browserErrorNames)).toBe(true);
    expect(Object.isFrozen(browserErrorNames.AbortError)).toBe(true);
    expect(Object.isFrozen(browserErrorPatterns)).toBe(true);
    expect(Object.isFrozen(browserErrorPatterns[0])).toBe(true);
    expect(Object.isFrozen(browserErrorPatterns[0][0])).toBe(true);
    expect(Object.isFrozen(browserErrorPatterns[0][1])).toBe(true);
    expect(Object.isFrozen(supabaseErrorCodes)).toBe(true);
    expect(Object.isFrozen(supabaseErrorCodes.invalid_credentials)).toBe(true);
    expect(Object.isFrozen(supabaseErrorNames.FunctionsHttpError)).toBe(true);
  });

  it("should mark only safe Supabase mappings as retryable", () => {
    const registry = createErrorRegistry([supabaseErrorRegistry]);

    expect(createAppError({ name: "FunctionsHttpError" }, { registry }).isRetryable).toBe(false);
    expect(createAppError({ code: "57014" }, { registry }).isRetryable).toBe(false);
    expect(createAppError({ name: "FunctionsFetchError" }, { registry }).isRetryable).toBe(false);
  });

  it("should not mark a relay error as retryable", () => {
    // functions-js raises it from a header on a response the relay sent back after it began
    // processing the call, so the function may already have run.
    expect(createAppError({ name: "FunctionsRelayError" }, { registry: supabaseErrorRegistry }).isRetryable).toBe(
      false,
    );
  });

  it("should classify the Auth errors the Supabase client raises without a server code", () => {
    // auth-js raises these itself: a missing session carries a name and no code, and a missing
    // PKCE verifier, from a link opened in another browser, carries a code the server never sends.
    const sessionMissing = Object.assign(new Error("Auth session missing!"), { name: "AuthSessionMissingError" });
    const verifierMissing = Object.assign(new Error("PKCE code verifier not found in storage."), {
      name: "AuthPKCECodeVerifierMissingError",
      code: "pkce_code_verifier_not_found",
    });

    expect(createAppError(sessionMissing, { registry: supabaseErrorRegistry })).toMatchObject({
      type: "known",
      code: "AuthSessionMissingError",
      messageKey: "error.supabase.auth.sessionEnded",
      isRetryable: false,
    });
    expect(createAppError(verifierMissing, { registry: supabaseErrorRegistry })).toMatchObject({
      type: "known",
      code: "pkce_code_verifier_not_found",
      messageKey: "error.supabase.auth.signInInterrupted",
      isRetryable: false,
    });
  });

  it("should not mark a rate limit as retryable", () => {
    // The flag carries no delay, so a loop that reads it would retry at once and count against
    // the limit again. The message tells the reader how long to wait.
    for (const code of ["over_sms_send_rate_limit", "over_email_send_rate_limit", "over_request_rate_limit"]) {
      expect(createAppError({ code }, { registry: supabaseErrorRegistry }).isRetryable).toBe(false);
    }
  });

  it("should not advise reloading a page in a preset that also runs outside a browser", () => {
    for (const { message } of Object.values(supabaseErrorCodes)) {
      expect(message).not.toMatch(/\bpage\b/i);
    }
  });

  it("should not mark ambiguous browser fetch failures as retryable", () => {
    const registry = createErrorRegistry([browserErrorRegistry]);

    expect(createAppError(new Error("Load failed"), { registry }).isRetryable).toBe(false);
    expect(createAppError(new Error("Failed to fetch"), { registry }).isRetryable).toBe(false);
    expect(createAppError({ name: "NetworkError" }, { registry }).isRetryable).toBe(false);
  });

  it("should not mark a timeout that may follow a sent request as retryable", () => {
    const registry = createErrorRegistry([browserErrorRegistry, nodeErrorRegistry]);

    expect(createAppError({ name: "TimeoutError" }, { registry }).isRetryable).toBe(false);
    expect(createAppError({ code: "UND_ERR_HEADERS_TIMEOUT" }, { registry }).isRetryable).toBe(false);
  });

  it("should not classify relayed server text that mentions a refused connection", () => {
    const relayed = new Error("psql: could not connect: Connection refused");

    expect(createAppError(relayed, { registry: browserErrorRegistry }).type).toBe("unknown");
  });

  it("should map only the Auth codes Supabase publishes", () => {
    expect(supabaseErrorCodes.invalid_grant).toBeUndefined();

    for (const code of ["weak_password", "session_expired", "over_request_rate_limit", "email_exists"]) {
      expect(createAppError({ code }, { registry: supabaseErrorRegistry })).toMatchObject({
        type: "known",
        code,
        source: "supabase.auth",
      });
    }
  });

  it("should give every developer-facing mapping the same message, naming no internals", () => {
    const registry = createErrorRegistry([browserErrorRegistry, supabaseErrorRegistry]);
    const messages = [
      { code: "42P01" },
      { code: "42703" },
      { code: "unexpected_failure" },
      { name: "InvalidStateError" },
    ].map((failure) => createAppError(failure, { registry }).message);

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).not.toMatch(/table|column|database|state/i);
  });

  it("should write every preset message as full sentences", () => {
    const presetFeedback = [
      ...Object.values(browserErrorNames),
      ...browserErrorPatterns.map(([, feedback]) => feedback),
      ...Object.values(nodeErrorCodes),
      ...nodeErrorPatterns.map(([, feedback]) => feedback),
      ...Object.values(supabaseErrorCodes),
      ...Object.values(supabaseErrorNames),
    ];

    for (const { message } of presetFeedback) {
      expect(message).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("should give each message key exactly one message", () => {
    const messagesByKey = new Map<string, string>();

    for (const feedback of [...Object.values(supabaseErrorCodes), ...Object.values(supabaseErrorNames)]) {
      const messageKey = feedback.messageKey ?? "";

      expect(messagesByKey.get(messageKey) ?? feedback.message).toBe(feedback.message);
      messagesByKey.set(messageKey, feedback.message);
    }
  });
});
