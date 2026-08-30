import { describe, expect, it } from "vitest";

import { parseAssetEntries } from "./manifest.ts";

const MANIFEST_PATH = "packages/example/package.json";

describe("parseAssetEntries", () => {
  it("shouldReturnAnEmptyArrayWhenNothingIsDeclared", () => {
    expect(parseAssetEntries({ name: "@fixture/example" }, MANIFEST_PATH)).toEqual([]);
  });

  it("shouldReadEveryDeclaredEntry", () => {
    const manifest = {
      codenhub: {
        assets: [
          { from: "favicon/favicon.ico", to: "public/favicon.ico" },
          { from: "logo/logo-dark.svg", to: "public/assets/logo/logo-dark.svg" },
        ],
      },
    };

    expect(parseAssetEntries(manifest, MANIFEST_PATH)).toEqual([
      { from: "favicon/favicon.ico", to: "public/favicon.ico" },
      { from: "logo/logo-dark.svg", to: "public/assets/logo/logo-dark.svg" },
    ]);
  });

  it("shouldRejectANonArrayAssetsField", () => {
    expect(() => parseAssetEntries({ codenhub: { assets: "favicon.ico" } }, MANIFEST_PATH)).toThrow(
      /expected an array/,
    );
  });

  it("shouldRejectAnEntryMissingFrom", () => {
    expect(() => parseAssetEntries({ codenhub: { assets: [{ to: "public/favicon.ico" }] } }, MANIFEST_PATH)).toThrow(
      /codenhub\.assets\[0\]\.from/,
    );
  });

  it("shouldRejectAnEntryMissingTo", () => {
    expect(() => parseAssetEntries({ codenhub: { assets: [{ from: "favicon/favicon.ico" }] } }, MANIFEST_PATH)).toThrow(
      /codenhub\.assets\[0\]\.to/,
    );
  });

  it("shouldRejectAnAbsoluteFrom", () => {
    const manifest = { codenhub: { assets: [{ from: "/favicon.ico", to: "public/favicon.ico" }] } };
    expect(() => parseAssetEntries(manifest, MANIFEST_PATH)).toThrow(/relative path/);
  });

  it("shouldRejectAToThatEscapesThePackageDirectory", () => {
    const manifest = { codenhub: { assets: [{ from: "favicon/favicon.ico", to: "../public/favicon.ico" }] } };
    expect(() => parseAssetEntries(manifest, MANIFEST_PATH)).toThrow(/relative path/);
  });

  it("shouldRejectBackslashesInAPath", () => {
    const manifest = { codenhub: { assets: [{ from: "favicon\\favicon.ico", to: "public/favicon.ico" }] } };
    expect(() => parseAssetEntries(manifest, MANIFEST_PATH)).toThrow(/forward slashes/);
  });

  it("shouldRejectAToWithADotSegment", () => {
    const manifest = { codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/./favicon.ico" }] } };
    expect(() => parseAssetEntries(manifest, MANIFEST_PATH)).toThrow(/relative path/);
  });

  it("shouldRejectAToWithAnEmptySegment", () => {
    const manifest = { codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public//favicon.ico" }] } };
    expect(() => parseAssetEntries(manifest, MANIFEST_PATH)).toThrow(/relative path/);
  });

  it("shouldRejectTwoEntriesDeclaringTheSameTo", () => {
    const manifest = {
      codenhub: {
        assets: [
          { from: "favicon/favicon-32.ico", to: "public/favicon.ico" },
          { from: "favicon/favicon-64.ico", to: "public/favicon.ico" },
        ],
      },
    };
    expect(() => parseAssetEntries(manifest, MANIFEST_PATH)).toThrow(/declared more than once/);
  });

  it("shouldRejectDestinationsWhereOneIsAnAncestorOfAnother", () => {
    const manifest = {
      codenhub: {
        assets: [
          { from: "logo/logo-dark.svg", to: "public/assets" },
          { from: "favicon/favicon.ico", to: "public/assets/favicon.ico" },
        ],
      },
    };

    expect(() => parseAssetEntries(manifest, MANIFEST_PATH)).toThrow(/conflicts with/);
  });
});
