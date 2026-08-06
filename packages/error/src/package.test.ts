import * as errorPackage from "@codenhub/error";
import * as registries from "@codenhub/error/registries";
import * as browserRegistries from "@codenhub/error/registries/browser";
import * as supabaseRegistries from "@codenhub/error/registries/supabase";
import { describe, expect, it } from "vitest";

describe("published package exports", () => {
  it("should load every public entrypoint", () => {
    expect(errorPackage.createAppError).toBeTypeOf("function");
    expect(registries.browserErrorRegistry).toBeDefined();
    expect(browserRegistries.browserErrorNames).toBeDefined();
    expect(supabaseRegistries.supabaseErrorCodes).toBeDefined();
  });

  it("should expose only the documented runtime exports", () => {
    expect(Object.keys(errorPackage).sort()).toEqual(
      [
        "DEFAULT_APP_ERROR_MESSAGE",
        "andThen",
        "andThenAsync",
        "attempt",
        "attemptAsync",
        "createAppError",
        "createErrorRegistry",
        "err",
        "freezeRegistry",
        "getErrorRegistry",
        "isAppError",
        "map",
        "mapAsync",
        "match",
        "ok",
        "setErrorRegistry",
        "unwrap",
        "unwrapOr",
      ].sort(),
    );
    expect(Object.keys(registries).sort()).toEqual(
      [
        "browserErrorNames",
        "browserErrorPatterns",
        "browserErrorRegistry",
        "supabaseErrorCodes",
        "supabaseErrorNames",
        "supabaseErrorRegistry",
      ].sort(),
    );
    expect(Object.keys(browserRegistries).sort()).toEqual(
      ["browserErrorNames", "browserErrorPatterns", "browserErrorRegistry"].sort(),
    );
    expect(Object.keys(supabaseRegistries).sort()).toEqual(
      ["supabaseErrorCodes", "supabaseErrorNames", "supabaseErrorRegistry"].sort(),
    );
  });
});
