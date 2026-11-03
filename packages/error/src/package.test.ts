import * as errorPackage from "@codenhub/error";
import * as reactAdapter from "@codenhub/error/react";
import * as registries from "@codenhub/error/registries";
import * as browserRegistries from "@codenhub/error/registries/browser";
import * as httpRegistries from "@codenhub/error/registries/http";
import * as nodeRegistries from "@codenhub/error/registries/node";
import * as supabaseRegistries from "@codenhub/error/registries/supabase";
import * as svelteAdapter from "@codenhub/error/svelte";
import { describe, expect, it } from "vitest";

describe("published package exports", () => {
  it("should load every public entrypoint", () => {
    expect(errorPackage.createAppError).toBeTypeOf("function");
    expect(registries.browserErrorRegistry).toBeDefined();
    expect(browserRegistries.browserErrorNames).toBeDefined();
    expect(nodeRegistries.nodeErrorCodes).toBeDefined();
    expect(supabaseRegistries.supabaseErrorCodes).toBeDefined();
  });

  it("should expose only the documented runtime exports", () => {
    expect(Object.keys(errorPackage).sort()).toEqual(
      [
        "DEFAULT_APP_ERROR_MESSAGE",
        "all",
        "andThen",
        "andThenAsync",
        "appErrorFromJSON",
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
        "orElse",
        "orElseAsync",
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
        "httpErrorCodes",
        "httpErrorRegistry",
        "nodeErrorCodes",
        "nodeErrorNames",
        "nodeErrorPatterns",
        "nodeErrorRegistry",
        "supabaseErrorCodes",
        "supabaseErrorNames",
        "supabaseErrorRegistry",
      ].sort(),
    );
    expect(Object.keys(browserRegistries).sort()).toEqual(
      ["browserErrorNames", "browserErrorPatterns", "browserErrorRegistry"].sort(),
    );
    expect(Object.keys(httpRegistries).sort()).toEqual(["httpErrorCodes", "httpErrorRegistry"]);
    expect(Object.keys(nodeRegistries).sort()).toEqual(
      ["nodeErrorCodes", "nodeErrorNames", "nodeErrorPatterns", "nodeErrorRegistry"].sort(),
    );
    expect(Object.keys(supabaseRegistries).sort()).toEqual(
      ["supabaseErrorCodes", "supabaseErrorNames", "supabaseErrorRegistry"].sort(),
    );
    expect(Object.keys(reactAdapter)).toEqual(["AppErrorBoundary"]);
    expect(Object.keys(svelteAdapter)).toEqual(["createAppErrorBoundary"]);
  });
});
