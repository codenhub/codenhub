import { describe, expect, it } from "vitest";

import {
  buildPackageDefinitions,
  buildPublicPackageSummaries,
  parsePackageMetadata,
  usesLegacyMetadata,
} from "./package-metadata.ts";

function createManifest(slug?: string) {
  return {
    name: "@codenhub/example",
    description: "Example package.",
    codenhub: {
      label: "Example",
      status: "experimental",
      ...(slug === undefined ? {} : { slug }),
      docs: {},
    },
  };
}

describe("package documentation catalog", () => {
  it("includes public packages without documentation", () => {
    const manifests = {
      "../../packages/documented/package.json": { ...createManifest(), private: false },
      "../../packages/undocumented/package.json": {
        name: "@codenhub/undocumented",
        description: "Undocumented package.",
        private: false,
      },
    };
    const definitions = buildPackageDefinitions(manifests, ["../../packages/documented/docs/index.md"]);

    expect(buildPublicPackageSummaries(manifests, definitions)).toContainEqual({
      description: "Undocumented package.",
      documentationRoute: undefined,
      label: "@codenhub/undocumented",
      name: "@codenhub/undocumented",
      status: undefined,
    });
  });

  it("excludes private workspaces from public package summaries", () => {
    const manifests = {
      "../../packages/public/package.json": {
        name: "@codenhub/public",
        private: false,
      },
      "../../packages/private/package.json": {
        name: "@codenhub/private",
        private: true,
      },
    };

    expect(buildPublicPackageSummaries(manifests, [])).toHaveLength(1);
  });

  it("adds documentation routes to documented public packages", () => {
    const manifests = {
      "../../packages/example/package.json": { ...createManifest("custom-slug"), private: false },
    };
    const definitions = buildPackageDefinitions(manifests, ["../../packages/example/docs/index.md"]);

    expect(buildPublicPackageSummaries(manifests, definitions)[0]?.documentationRoute).toBe("/custom-slug/");
  });

  it("keeps unlisted documentation routable while excluding its package summary", () => {
    const manifest = {
      ...createManifest(),
      private: false,
      codenhub: { ...createManifest().codenhub, listed: false },
    };
    const manifests = { "../../packages/example/package.json": manifest };
    const definitions = buildPackageDefinitions(manifests, ["../../packages/example/docs/index.md"]);

    expect(definitions[0]?.documents[0]?.routePath).toBe("");
    expect(buildPublicPackageSummaries(manifests, definitions)).toEqual([]);
  });

  it("excludes internal documents and derives index routes", () => {
    const packages = buildPackageDefinitions({ "../../packages/example/package.json": createManifest() }, [
      "../../packages/example/docs/index.md",
      "../../packages/example/docs/guides/index.md",
      "../../packages/example/docs/internal/roadmap.md",
    ]);

    expect(packages[0]?.documents).toEqual([
      {
        relativePath: "index.md",
        routePath: "",
        sourcePath: "../../packages/example/docs/index.md",
      },
      {
        relativePath: "guides/index.md",
        routePath: "guides",
        sourcePath: "../../packages/example/docs/guides/index.md",
      },
    ]);
  });

  it("rejects duplicate package slugs", () => {
    expect(() =>
      buildPackageDefinitions(
        {
          "../../packages/first/package.json": createManifest("shared"),
          "../../packages/second/package.json": createManifest("shared"),
        },
        ["../../packages/first/docs/index.md", "../../packages/second/docs/index.md"],
      ),
    ).toThrow('Duplicate documentation slug "shared"');
  });

  it("uses package slugs to deterministically order duplicate labels", () => {
    const manifests = {
      "../../packages/beta/package.json": {
        ...createManifest("beta"),
        name: "@codenhub/beta",
      },
      "../../packages/alpha/package.json": {
        ...createManifest("alpha"),
        name: "@codenhub/alpha",
      },
    };

    expect(
      buildPackageDefinitions(manifests, [
        "../../packages/beta/docs/index.md",
        "../../packages/alpha/docs/index.md",
      ]).map(({ slug }) => slug),
    ).toEqual(["alpha", "beta"]);
  });

  it("uses package names to deterministically order duplicate summary labels", () => {
    const manifests = {
      "../../packages/beta/package.json": {
        ...createManifest("beta"),
        name: "@codenhub/beta",
        private: false,
      },
      "../../packages/alpha/package.json": {
        ...createManifest("alpha"),
        name: "@codenhub/alpha",
        private: false,
      },
    };
    const definitions = buildPackageDefinitions(manifests, [
      "../../packages/beta/docs/index.md",
      "../../packages/alpha/docs/index.md",
    ]);

    expect(buildPublicPackageSummaries(manifests, definitions).map(({ name }) => name)).toEqual([
      "@codenhub/alpha",
      "@codenhub/beta",
    ]);
  });

  it("rejects packages without an index", () => {
    expect(() =>
      buildPackageDefinitions({ "../../packages/example/package.json": createManifest() }, [
        "../../packages/example/docs/reference.md",
      ]),
    ).toThrow("Missing docs/index.md");
  });

  it("rejects invalid metadata", () => {
    expect(() =>
      parsePackageMetadata(
        {
          name: "@codenhub/example",
          codenhub: { label: "Example", status: "stable", docs: {} },
        },
        "package.json",
      ),
    ).toThrow("Invalid codenhub.status");
  });

  it("rejects documentation metadata without a label", () => {
    expect(() =>
      parsePackageMetadata(
        {
          name: "@codenhub/example",
          codenhub: { status: "experimental", docs: {} },
        },
        "package.json",
      ),
    ).toThrow("Invalid codenhub.label");
  });

  it("rejects non-boolean catalog listing metadata", () => {
    expect(() =>
      parsePackageMetadata(
        {
          name: "@codenhub/example",
          codenhub: { label: "Example", listed: "no", status: "experimental", docs: {} },
        },
        "package.json",
      ),
    ).toThrow("Invalid codenhub.listed");
  });

  it("uses the package description when documentation metadata omits it", () => {
    expect(parsePackageMetadata(createManifest(), "package.json")?.description).toBe("Example package.");
  });

  it("keeps an absolute demo URL", () => {
    const manifest = {
      name: "@codenhub/example",
      codenhub: { demoUrl: "https://example.coden.agency", label: "Example", status: "experimental", docs: {} },
    };

    expect(parsePackageMetadata(manifest, "package.json")?.demoUrl).toBe("https://example.coden.agency");
  });

  it("rejects a demo URL that is not absolute", () => {
    expect(() =>
      parsePackageMetadata(
        {
          name: "@codenhub/example",
          codenhub: { demoUrl: "/demo", label: "Example", status: "experimental", docs: {} },
        },
        "package.json",
      ),
    ).toThrow("Invalid codenhub.demoUrl");
  });

  it("reads the pre-migration shape from codenhub.docs", () => {
    const manifest = {
      name: "@codenhub/example",
      codenhub: { docs: { label: "Example", listed: false, reference: {}, status: "active" } },
    };

    expect(usesLegacyMetadata(manifest)).toBe(true);
    expect(parsePackageMetadata(manifest, "package.json")).toMatchObject({
      documented: true,
      label: "Example",
      listed: false,
      status: "active",
    });
  });

  it("names the pre-migration field in its errors", () => {
    expect(() =>
      parsePackageMetadata({ name: "@codenhub/example", codenhub: { docs: { label: "Example" } } }, "package.json"),
    ).toThrow("Invalid codenhub.docs.status");
  });

  it("does not treat a reference-only codenhub.docs as the pre-migration shape", () => {
    expect(usesLegacyMetadata({ codenhub: { label: "Example", status: "active", docs: { reference: {} } } })).toBe(
      false,
    );
  });

  it("rejects a manifest that mixes both shapes", () => {
    expect(() =>
      parsePackageMetadata(
        { name: "@codenhub/example", codenhub: { label: "Example", docs: { status: "active" } } },
        "package.json",
      ),
    ).toThrow("not inside codenhub.docs");
  });

  it("reads identity without opting into the documentation site", () => {
    const manifest = { name: "@codenhub/example", codenhub: { label: "Example", status: "active" } };

    expect(parsePackageMetadata(manifest, "package.json")?.documented).toBe(false);
    expect(buildPackageDefinitions({ "../../packages/example/package.json": manifest }, [])).toEqual([]);
  });

  it("returns null when codenhub declares neither identity nor docs", () => {
    expect(parsePackageMetadata({ name: "@codenhub/example", codenhub: { bundled: [] } }, "package.json")).toBeNull();
  });

  it("keeps a package-relative SVG logo", () => {
    const manifest = createManifest();
    expect(
      parsePackageMetadata({ ...manifest, codenhub: { ...manifest.codenhub, logo: "assets/logo.svg" } }, "package.json")
        ?.logo,
    ).toBe("assets/logo.svg");
  });

  it.each(["../logo.svg", "/logo.svg", "./logo.svg", "assets\\logo.svg", "logo.png"])(
    "rejects the logo path %s",
    (logo) => {
      const manifest = createManifest();
      expect(() =>
        parsePackageMetadata({ ...manifest, codenhub: { ...manifest.codenhub, logo } }, "package.json"),
      ).toThrow("Invalid codenhub.logo");
    },
  );
});
