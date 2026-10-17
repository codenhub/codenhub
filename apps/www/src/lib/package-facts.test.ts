import { describe, expect, it } from "vitest";

import { describeProperties, describeReleases } from "./package-facts";

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
      entrypoints: [".", "./data/*", "./package.json"],
      isEsmOnly: true,
      isSideEffectFree: true,
      peerDependencies: ["@codenhub/styles", "react"],
      shipsTypes: true,
    });
  });

  it("does not call a package with a require condition ESM-only", () => {
    const properties = describeProperties({
      exports: { ".": { import: "./index.js", require: "./index.cjs" } },
      type: "module",
    });

    expect(properties).toMatchObject({ isEsmOnly: false, isSideEffectFree: false, shipsTypes: false });
  });
});
