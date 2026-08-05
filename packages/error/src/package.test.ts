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
});
