import { describe, expect, it } from "vitest";

import { packageDemoUrl, packageDocsUrl, packageNpmUrl } from "./package-links.ts";

describe("packageDocsUrl", () => {
  it("scopes the docs root to the package's route", () => {
    expect(packageDocsUrl("https://docs.codenhub.dev", "icons")).toBe("https://docs.codenhub.dev/icons/");
  });
});

describe("packageDemoUrl", () => {
  it("scopes the demo root to the package's mounted demo", () => {
    expect(packageDemoUrl("https://demo.codenhub.dev", "styles")).toBe("https://demo.codenhub.dev/styles/");
  });
});

describe("packageNpmUrl", () => {
  it("builds the npmjs.com listing URL for a scoped package name", () => {
    expect(packageNpmUrl("@codenhub/icons")).toBe("https://www.npmjs.com/package/@codenhub/icons");
  });
});
