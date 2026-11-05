import { describe, expect, it } from "vitest";

import {
  describeProperties,
  describeReleases,
  describeRootSize,
  formatBytes,
  npmTarballUrl,
  packageCommand,
} from "./package-facts";

describe("describeReleases", () => {
  it("takes the newest stable release as the latest, skipping a newer pre-release", () => {
    const history = [
      { date: "2026-10-10T00:00:00+00:00", isPrerelease: true, version: "0.4.0-beta.1" },
      { date: "2026-10-01T00:00:00+00:00", isPrerelease: false, version: "0.3.0" },
    ];

    expect(describeReleases(history)).toEqual({ history, lastPublished: history[0], latest: history[1] });
  });

  it("takes the last published release by date, not by version, so a backport counts", () => {
    const history = [
      { date: "2026-09-01T00:00:00+00:00", isPrerelease: false, version: "2.0.0" },
      { date: "2026-10-05T00:00:00+00:00", isPrerelease: false, version: "1.4.1" },
    ];

    expect(describeReleases(history).lastPublished).toBe(history[1]);
  });

  it("has no latest release for a package without one", () => {
    expect(describeReleases()).toEqual({ history: [], lastPublished: undefined, latest: undefined });
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
      isCli: false,
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

  it("lists no entrypoint for a package that exports only its manifest", () => {
    expect(describeProperties({ exports: { "./package.json": "./package.json" } }).entrypoints).toEqual([]);
  });

  it("calls a package a CLI when it declares bin and exports nothing but its manifest", () => {
    const exports = { "./package.json": "./package.json" };

    expect(describeProperties({ bin: { "codenhub-skills": "./dist/cli.js" }, exports }).isCli).toBe(true);
    expect(describeProperties({ bin: "./dist/cli.js" }).isCli).toBe(true);
    expect(describeProperties({ exports }).isCli).toBe(false);
  });

  it("keeps a package with bin and a library entrypoint a library", () => {
    const manifest = { bin: { tool: "./dist/cli.js" }, exports: { ".": "./dist/index.js" } };

    expect(describeProperties(manifest).isCli).toBe(false);
    expect(describeProperties({ bin: "./dist/cli.js", main: "./dist/index.js" }).isCli).toBe(false);
  });

  it("keeps a package with several binaries a library, since npx cannot pick one", () => {
    expect(describeProperties({ bin: { a: "./dist/a.js", b: "./dist/b.js" } }).isCli).toBe(false);
  });

  it("does not call a package with a require condition ESM-only", () => {
    const properties = describeProperties({
      exports: { ".": { import: "./index.js", require: "./index.cjs" } },
      type: "module",
    });

    expect(properties).toMatchObject({ isEsmOnly: false, isSideEffectFree: false, shipsTypes: false });
  });
});

describe("packageCommand", () => {
  it("adds a library to the project", () => {
    expect(packageCommand("npm", "@codenhub/error", false)).toBe("npm install @codenhub/error");
    expect(packageCommand("bun", "@codenhub/error", false, "0.3.0")).toBe("bun add @codenhub/error@0.3.0");
  });

  it("runs a CLI without installing it, at the latest version unless one is pinned", () => {
    expect(packageCommand("npm", "@codenhub/skills", true)).toBe("npx @codenhub/skills@latest");
    expect(packageCommand("pnpm", "@codenhub/skills", true)).toBe("pnpm dlx @codenhub/skills@latest");
    expect(packageCommand("yarn", "@codenhub/skills", true)).toBe("yarn dlx @codenhub/skills@latest");
    expect(packageCommand("bun", "@codenhub/skills", true, "0.3.0")).toBe("bunx @codenhub/skills@0.3.0");
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

  it("writes the figure in the page's locale", () => {
    expect(formatBytes(27_598, "pt-BR")).toBe("27,6 kB");
    expect(formatBytes(16_550_509, "es")).toBe("16,6 MB");
    expect(formatBytes(840, "pt-BR")).toBe("840 B");
  });
});

describe("describeRootSize", () => {
  const entry = (minified: number, gzip: number) => ({ gzip, minified, sha256: "aa" });

  it("shows the root entrypoint's gzipped size", () => {
    const size = { bundler: "rolldown@1.1.5", entrypoints: { ".": entry(82_538, 27_598), "./x": entry(1, 1) } };

    expect(describeRootSize(size)).toBe("27.6 kB gzip");
    expect(describeRootSize(size, "pt-BR")).toBe("27,6 kB gzip");
  });

  it("shows a root with no runtime code as costing nothing", () => {
    expect(describeRootSize({ bundler: "rolldown@1.1.5", entrypoints: { ".": entry(0, 20) } })).toBe("0 B gzip");
  });

  it("shows nothing for a release without a size or without a measured root", () => {
    expect(describeRootSize(undefined)).toBeUndefined();
    expect(describeRootSize({ bundler: "rolldown@1.1.5", entrypoints: { "./x": entry(1, 1) } })).toBeUndefined();
  });
});

describe("npmTarballUrl", () => {
  it("names a scoped package's tarball after its unscoped name", () => {
    expect(npmTarballUrl("@codenhub/validation", "0.4.0")).toBe(
      "https://registry.npmjs.org/@codenhub/validation/-/validation-0.4.0.tgz",
    );
  });

  it("names an unscoped package's tarball after its name", () => {
    expect(npmTarballUrl("left-pad", "1.3.0")).toBe("https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz");
  });
});
