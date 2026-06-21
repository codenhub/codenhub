import { describe, expect, it } from "vitest";

import { AppError, createErrorRegistry } from "../index";
import { browserErrorRegistry, supabaseErrorRegistry } from "./index";

describe("ready registries", () => {
  it("exports browser and supabase registries without mutating the default registry", () => {
    expect(new AppError(new DOMException("Aborted", "AbortError"))).toMatchObject({
      type: "unknown",
    });
    expect(new AppError({ code: "invalid_credentials" })).toMatchObject({
      type: "unknown",
    });

    const registry = createErrorRegistry();

    registry.merge(browserErrorRegistry);
    registry.merge(supabaseErrorRegistry);

    expect(new AppError(new DOMException("Aborted", "AbortError"), { registry })).toMatchObject({
      type: "known",
      messageKey: "error.browser.abort",
      source: "browser",
      retryable: false,
    });
    expect(new AppError({ code: "invalid_credentials" }, { registry })).toMatchObject({
      type: "known",
      messageKey: "error.supabase.auth.invalidCredentials",
      source: "supabase.auth",
      retryable: false,
    });
  });
});
