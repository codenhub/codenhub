import { describe, expect, it } from "vitest";

import { createAppError, createErrorRegistry } from "../index";
import { browserErrorRegistry, supabaseErrorRegistry } from "./index";

describe("ready registries", () => {
  it("exports browser and supabase registries without mutating the default registry", () => {
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
      retryable: false,
    });
    expect(createAppError({ code: "invalid_credentials" }, { registry })).toMatchObject({
      type: "known",
      messageKey: "error.supabase.auth.invalidCredentials",
      source: "supabase.auth",
      retryable: false,
    });
  });
});
