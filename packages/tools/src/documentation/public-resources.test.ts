import { describe, expect, it } from "vitest";

import { discoverPublicResources } from "./public-resources.ts";

describe("discoverPublicResources", () => {
  it("shouldDiscoverPublicAssetsAndPackageLegalFiles", () => {
    expect(
      discoverPublicResources("example", [
        "LICENSE",
        "README.md",
        "docs/.npmignore",
        "docs/assets/diagram.svg",
        "docs/internal/secret.txt",
        "docs/reference.md",
      ]),
    ).toEqual([
      { packagePath: "LICENSE", routePath: "/example/LICENSE" },
      { packagePath: "docs/assets/diagram.svg", routePath: "/example/assets/diagram.svg" },
    ]);
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
