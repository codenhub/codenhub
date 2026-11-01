import { describe, expect, it } from "vitest";

import {
  compareSizeReports,
  listMeasuredEntrypoints,
  parseSizeReport,
  serializeSizeReport,
  type SizeReport,
} from "./size-report.ts";

const [HASH_A, HASH_B, HASH_C, HASH_D] = ["a", "b", "c", "d"].map((digit) => digit.repeat(64));

const REPORT: SizeReport = {
  bundler: "rolldown@1.1.5",
  entrypoints: {
    ".": {
      exports: { create: { gzip: 300, minified: 700 }, helper: { gzip: 20, minified: 50 } },
      files: { "(unattributed)": 10, "node_modules/dependency": 90, "src/core.ts": 600, "src/helper.ts": 300 },
      gzip: 400,
      minified: 1000,
      sha256: HASH_A,
    },
    "./client": { gzip: 40, minified: 100, sha256: HASH_B },
  },
};

describe("listMeasuredEntrypoints", () => {
  it("resolves each subpath through import, else default, nesting included", () => {
    const exports = {
      ".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
      "./client": { default: "./dist/client.mjs", types: "./dist/client.d.ts" },
      "./nested": { import: { default: "./dist/nested.js", types: "./dist/nested.d.ts" } },
      "./plain": "./dist/plain.js",
    };

    expect(listMeasuredEntrypoints({ exports })).toEqual([
      { subpath: ".", target: "dist/index.js" },
      { subpath: "./client", target: "dist/client.mjs" },
      { subpath: "./nested", target: "dist/nested.js" },
      { subpath: "./plain", target: "dist/plain.js" },
    ]);
  });

  it("leaves out CSS, wildcard subpaths, and package.json", () => {
    const exports = {
      ".": { import: "./dist/index.css", style: "./dist/index.css" },
      "./data/*": "./dist/data/*.js",
      "./package.json": "./package.json",
      "./tw": "./dist/tw/index.css",
    };

    expect(listMeasuredEntrypoints({ exports })).toEqual([]);
  });

  it("reads exports written as the root entrypoint alone", () => {
    expect(listMeasuredEntrypoints({ exports: "./dist/index.js" })).toEqual([
      { subpath: ".", target: "dist/index.js" },
    ]);
    expect(listMeasuredEntrypoints({ exports: { import: "./dist/index.js" } })).toEqual([
      { subpath: ".", target: "dist/index.js" },
    ]);
  });

  it("measures nothing for a package without exports", () => {
    expect(listMeasuredEntrypoints({})).toEqual([]);
  });
});

describe("parseSizeReport", () => {
  it("reads back what serializeSizeReport writes", () => {
    expect(parseSizeReport(serializeSizeReport(REPORT), "size.json")).toEqual(REPORT);
  });

  it("refuses contents that are not a size report", () => {
    expect(() => parseSizeReport("{", "size.json")).toThrow("size.json is not a size report: it is not JSON");
    expect(() => parseSizeReport("[]", "size.json")).toThrow(`"bundler" must name the bundler`);
    expect(() => parseSizeReport(`{"bundler":"rolldown@1.1.5","entrypoints":[]}`, "size.json")).toThrow(
      `"entrypoints" must be an object`,
    );
    expect(() =>
      parseSizeReport(`{"bundler":"rolldown@1.1.5","entrypoints":{".":{"minified":1.5,"gzip":1,"sha256":"a"}}}`, "x"),
    ).toThrow(`"." needs integer "minified" and "gzip"`);
    expect(() =>
      parseSizeReport(`{"bundler":"rolldown@1.1.5","entrypoints":{".":{"minified":1,"gzip":1,"sha256":"AB"}}}`, "x"),
    ).toThrow(`"." has a "sha256" that is not 64 lowercase hex digits`);
    const entry = `"minified":1,"gzip":1,"sha256":"${HASH_A}"`;
    expect(() =>
      parseSizeReport(`{"bundler":"r","entrypoints":{".":{${entry},"exports":{"a":{"minified":1}}}}}`, "x"),
    ).toThrow(`"." export "a" needs integer "minified" and "gzip"`);
    expect(() => parseSizeReport(`{"bundler":"r","entrypoints":{".":{${entry},"files":{"a.ts":-1}}}}`, "x")).toThrow(
      `"." file "a.ts" needs an integer byte count`,
    );
  });

  it("reads a report recorded before exports and files were measured", () => {
    const contents = `{"bundler":"rolldown@1.1.5","entrypoints":{".":{"minified":1,"gzip":1,"sha256":"${HASH_A}"}}}`;

    expect(parseSizeReport(contents, "size.json")).toEqual({
      bundler: "rolldown@1.1.5",
      entrypoints: { ".": { gzip: 1, minified: 1, sha256: HASH_A } },
    });
  });
});

describe("compareSizeReports", () => {
  it("agrees when only gzipped lengths differ", () => {
    const measured = structuredClone(REPORT);
    const root = measured.entrypoints["."]!;
    root.gzip = 401;
    root.exports!.create!.gzip = 301;

    expect(compareSizeReports(REPORT, measured)).toEqual([]);
  });

  it("reports changed export and file sizes even when the whole bundle is unchanged", () => {
    // Dropping a `/* @__PURE__ */` annotation leaves the minified whole bundle
    // byte-for-byte identical but changes what a single export tree-shakes to.
    const measured = structuredClone(REPORT);
    const root = measured.entrypoints["."]!;
    root.exports!.helper!.minified = 750;
    delete root.exports!.create;
    root.exports!.extra = { gzip: 1, minified: 1 };
    root.files!["src/core.ts"] = 500;
    root.files!["src/moved.ts"] = 100;

    expect(compareSizeReports(REPORT, measured)).toEqual([
      ". export create is recorded but not measured",
      ". export helper is 750 bytes minified, recorded 50",
      ". export extra is measured but not recorded",
      ". file src/core.ts is 500 bytes, recorded 600",
      ". file src/moved.ts is measured but not recorded",
    ]);
  });

  it("does not compare a breakdown a release recorded before it was measured", () => {
    const recorded = structuredClone(REPORT);
    delete recorded.entrypoints["."]!.exports;
    delete recorded.entrypoints["."]!.files;

    expect(compareSizeReports(recorded, REPORT)).toEqual([]);
  });

  it("reports a different bundler, a changed entrypoint, and entrypoints on one side only", () => {
    const measured: SizeReport = {
      bundler: "rolldown@1.2.0",
      entrypoints: {
        ".": { ...structuredClone(REPORT.entrypoints["."]!), sha256: HASH_D },
        "./server": { gzip: 1, minified: 1, sha256: HASH_C },
      },
    };
    const shorter = structuredClone(REPORT);
    (shorter.entrypoints["./client"] as { minified: number }).minified = 90;

    expect(compareSizeReports(REPORT, shorter)).toEqual(["./client is 90 bytes minified, recorded 100"]);

    expect(compareSizeReports(REPORT, measured)).toEqual([
      "measured with rolldown@1.2.0, recorded with rolldown@1.1.5",
      ". has the recorded length but different bytes",
      "./client is recorded but not measured",
      "./server is measured but not recorded",
    ]);
  });
});
