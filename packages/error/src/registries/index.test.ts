import { describe, expect, it } from "vitest";

import { createAppError, createErrorRegistry } from "../index";
import { browserErrorRegistry, supabaseErrorRegistry } from "./index";

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
});
