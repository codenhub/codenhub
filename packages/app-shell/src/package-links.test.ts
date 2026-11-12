import { describe, expect, it } from "vitest";

import { packageDemoUrl, packageDocsUrl, packageGithubUrl, packageNpmUrl } from "./package-links.ts";

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

describe("packageGithubUrl", () => {
  it("links the package's directory from its manifest repository", () => {
    expect(
      packageGithubUrl({
        homepage: "https://codenhub.dev/packages/error/",
        repository: { directory: "packages/error", type: "git", url: "git+https://github.com/codenhub/codenhub.git" },
      }),
    ).toBe("https://github.com/codenhub/codenhub/tree/main/packages/error");
  });

  it("trims slashes around the directory", () => {
    expect(
      packageGithubUrl({ repository: { directory: "/packages/icons/", url: "https://github.com/codenhub/codenhub" } }),
    ).toBe("https://github.com/codenhub/codenhub/tree/main/packages/icons");
  });

  it("links the repository root when there is no directory", () => {
    expect(packageGithubUrl({ repository: "https://github.com/codenhub/codenhub.git" })).toBe(
      "https://github.com/codenhub/codenhub",
    );
  });

  it("is undefined when the repository is missing or not on GitHub", () => {
    expect(
      packageGithubUrl({ homepage: "https://github.com/codenhub/codenhub/tree/main/packages/jwt" }),
    ).toBeUndefined();
    expect(packageGithubUrl({ repository: { url: "https://gitlab.com/codenhub/codenhub.git" } })).toBeUndefined();
    expect(packageGithubUrl(undefined)).toBeUndefined();
  });
});
