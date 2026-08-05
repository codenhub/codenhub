import { describe, expect, it } from "vitest";

import { createAppError, createErrorRegistry } from "../index";
import {
  browserErrorRegistry,
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
    expect(createAppError({ code: "over_sms_send_rate_limit" }, { registry }).isRetryable).toBe(true);
    expect(createAppError({ code: "over_email_send_rate_limit" }, { registry }).isRetryable).toBe(true);
  });
});
