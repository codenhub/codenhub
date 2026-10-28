import { describe, expect, it } from "vitest";

import { discoverPublicResources, publishLlmsText, resolveSiteRoute } from "./public-resources.ts";

describe("discoverPublicResources", () => {
  it("shouldDiscoverPublicAssetsAndPackageLegalFiles", () => {
    expect(
      discoverPublicResources("example", [
        "LICENSE",
        "README.md",
        "docs/.npmignore",
        "docs/assets/diagram.svg",
        "docs/internal/secret.txt",
        "docs/plans/draft.txt",
        "docs/reference.md",
      ]),
    ).toEqual([
      { packagePath: "LICENSE", routePath: "/example/LICENSE" },
      { packagePath: "docs/assets/diagram.svg", routePath: "/example/assets/diagram.svg" },
    ]);
  });

  it("shouldPublishBothLlmFilesAtThePackageRoute", () => {
    expect(discoverPublicResources("example", ["llms-full.txt", "llms.txt", "docs/llms.md"])).toEqual([
      { packagePath: "llms-full.txt", routePath: "/example/llms-full.txt" },
      { packagePath: "llms.txt", routePath: "/example/llms.txt" },
    ]);
  });

  it("shouldRejectADocsAssetThatShadowsAnLlmFile", () => {
    expect(() => discoverPublicResources("example", ["llms.txt", "docs/llms.txt"])).toThrow(
      "Duplicate public resource route",
    );
  });

  it("shouldRejectResourcesThatCollideWithGeneratedDocumentOutput", () => {
    expect(() => discoverPublicResources("example", ["docs/index.md", "docs/index.html"])).toThrow(
      "collides with a documentation page",
    );
    expect(() => discoverPublicResources("example", ["docs/guides/index.md", "docs/guides"])).toThrow(
      "collides with a documentation page",
    );
    expect(() =>
      discoverPublicResources("example", ["docs/reference.md", "docs/reference/index.html/details.txt"]),
    ).toThrow("collides with a documentation page");
  });

  it("shouldRejectDuplicateResourceRoutesUsingPortableCasing", () => {
    expect(() => discoverPublicResources("example", ["NOTICE", "docs/notice"])).toThrow(
      "Duplicate public resource route",
    );
  });
});

describe("resolveSiteRoute", () => {
  it("shouldMapPublicDocumentsToTheirPageRoutes", () => {
    expect(resolveSiteRoute("example", "docs/index.md")).toBe("/example/");
    expect(resolveSiteRoute("example", "docs/reference.md")).toBe("/example/reference/");
    expect(resolveSiteRoute("example", "docs/guides/index.md")).toBe("/example/guides/");
  });

  it("shouldMapPublishedFilesToTheirResourceRoutes", () => {
    expect(resolveSiteRoute("example", "docs/assets/diagram.svg")).toBe("/example/assets/diagram.svg");
    expect(resolveSiteRoute("example", "LICENSE")).toBe("/example/LICENSE");
    expect(resolveSiteRoute("example", "llms-full.txt")).toBe("/example/llms-full.txt");
  });

  it("shouldReturnUndefinedForFilesTheSiteDoesNotPublish", () => {
    expect(resolveSiteRoute("example", "README.md")).toBeUndefined();
    expect(resolveSiteRoute("example", "src/index.ts")).toBeUndefined();
    expect(resolveSiteRoute("example", "docs/internal/architecture.md")).toBeUndefined();
    expect(resolveSiteRoute("example", "docs/plans/draft.md")).toBeUndefined();
    expect(resolveSiteRoute("example", "docs/.npmignore")).toBeUndefined();
  });
});

describe("publishLlmsText", () => {
  const site = { siteUrl: "https://docs.example.dev", slug: "example" };

  it("shouldRewritePackageRelativeLinksToAbsoluteSiteUrls", () => {
    const body = ["- [Overview](docs/index.md)", "- [Errors](./docs/reference.md#errors)", "- [License](LICENSE)"];

    expect(publishLlmsText(body.join("\n"), site)).toBe(
      [
        "- [Overview](https://docs.example.dev/example/)",
        "- [Errors](https://docs.example.dev/example/reference/#errors)",
        "- [License](https://docs.example.dev/example/LICENSE)",
      ].join("\n"),
    );
  });

  it("shouldRewriteImagesDefinitionsAndHtmlAttributes", () => {
    const body = ["![D](docs/assets/d.svg)", "", "[ref]: docs/setup.md", '<img src="docs/assets/d.svg">'];

    expect(publishLlmsText(body.join("\n"), site)).toBe(
      [
        "![D](https://docs.example.dev/example/assets/d.svg)",
        "",
        "[ref]: https://docs.example.dev/example/setup/",
        '<img src="https://docs.example.dev/example/assets/d.svg">',
      ].join("\n"),
    );
  });

  it("shouldRewriteAngleBracketDestinations", () => {
    expect(publishLlmsText("[Overview](<docs/index.md>)", site)).toBe(
      "[Overview](<https://docs.example.dev/example/>)",
    );
  });

  it("shouldLeaveTargetsTheSiteDoesNotPublishUnchanged", () => {
    const body = "[README](./README.md) [Site](https://example.com) [Here](#usage) [Escape](../other/llms.txt)";

    expect(publishLlmsText(body, site)).toBe(body);
  });

  it("shouldNotRewriteLinksInsideCode", () => {
    const body = ["```md", "[x](docs/index.md)", "```", "", "Use `[x](docs/index.md)` verbatim."].join("\n");

    expect(publishLlmsText(body, site)).toBe(body);
  });

  it("shouldResolveAgainstASiteUrlWithATrailingSlash", () => {
    expect(publishLlmsText("[O](docs/index.md)", { ...site, siteUrl: "https://docs.example.dev/" })).toBe(
      "[O](https://docs.example.dev/example/)",
    );
  });
});
