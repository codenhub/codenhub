import { describe, expect, it } from "vitest";

import { describeProperties, describeReleases, describeRootSize, formatBytes } from "./package-facts";

describe("describeReleases", () => {
  it("takes the newest stable release as the latest, skipping a newer pre-release", () => {
    const history = [
      { date: "2026-10-10T00:00:00+00:00", isPrerelease: true, version: "0.4.0-beta.1" },
      { date: "2026-10-01T00:00:00+00:00", isPrerelease: false, version: "0.3.0" },
    ];

    expect(describeReleases(history)).toEqual({ history, latest: history[1] });
  });

  it("has no latest release for a package without one", () => {
    expect(describeReleases()).toEqual({ history: [], latest: undefined });
  });
});

describe("describeProperties", () => {
  it("reads dependencies, peers, side effects, module format, types, and entrypoints", () => {
    expect(
      describeProperties({
        codenhub: { bundled: ["@codenhub/validation"] },
        dependencies: { a: "1", b: "1" },
        exports: {
          ".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
          "./data/*": "./dist/data/*.js",
          "./package.json": "./package.json",
        },
        peerDependencies: { react: "*", "@codenhub/styles": "*" },
        sideEffects: false,
        type: "module",
      }),
    ).toEqual({
      bundled: ["@codenhub/validation"],
      dependencyCount: 2,
      entrypoints: [".", "./data/*"],
      isEsmOnly: true,
      isSideEffectFree: true,
      peerDependencies: ["@codenhub/styles", "react"],
      shipsTypes: true,
    });
  });

  it("treats a conditions-only exports map as the root entrypoint", () => {
    expect(describeProperties({ exports: { import: "./index.js", types: "./index.d.ts" } }).entrypoints).toEqual(["."]);
    expect(describeProperties({ exports: "./index.js" }).entrypoints).toEqual(["."]);
  });

  it("does not call a package with a require condition ESM-only", () => {
    const properties = describeProperties({
      exports: { ".": { import: "./index.js", require: "./index.cjs" } },
      type: "module",
    });

    expect(properties).toMatchObject({ isEsmOnly: false, isSideEffectFree: false, shipsTypes: false });
  });
});

describe("formatBytes", () => {
  it("quotes bytes, kilobytes, and megabytes in decimal units", () => {
    expect(formatBytes(840)).toBe("840 B");
    expect(formatBytes(27_598)).toBe("27.6 kB");
    expect(formatBytes(16_550_509)).toBe("16.6 MB");
  });

  it("moves to the next unit when rounding reaches it", () => {
    expect(formatBytes(999_960)).toBe("1.0 MB");
    expect(formatBytes(949)).toBe("949 B");
  });
});

describe("describeRootSize", () => {
  const entry = (minified: number, gzip: number) => ({ gzip, minified, sha256: "aa" });

  it("shows the root entrypoint's gzipped size", () => {
    const size = { bundler: "rolldown@1.1.5", entrypoints: { ".": entry(82_538, 27_598), "./x": entry(1, 1) } };

    expect(describeRootSize(size)).toBe("27.6 kB gzip");
  });

  it("shows a root with no runtime code as costing nothing", () => {
    expect(describeRootSize({ bundler: "rolldown@1.1.5", entrypoints: { ".": entry(0, 20) } })).toBe("0 B gzip");
  });

  it("shows nothing for a release without a size or without a measured root", () => {
    expect(describeRootSize(undefined)).toBeUndefined();
    expect(describeRootSize({ bundler: "rolldown@1.1.5", entrypoints: { "./x": entry(1, 1) } })).toBeUndefined();
  });
});
