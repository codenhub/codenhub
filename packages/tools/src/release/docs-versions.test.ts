import { describe, expect, it } from "vitest";

import { findUnmatchedDocsVersions, resolveDocsVersionRedirects, selectDocsVersions } from "./docs-versions.ts";

describe("selectDocsVersions", () => {
  it("keeps nothing archived before 1.0 unless listed", () => {
    expect(selectDocsVersions(["0.3.0", "0.4.0", "0.4.1", "0.5.0"])).toEqual({ archived: [], current: "0.5.0" });
  });

  it("keeps the newest release of each other major from 1.0", () => {
    expect(selectDocsVersions(["0.9.0", "1.0.0", "1.2.3", "2.0.0", "2.1.0", "3.0.0"])).toEqual({
      archived: ["2.1.0", "1.2.3"],
      current: "3.0.0",
    });
  });

  it("keeps the newest release each entry matches", () => {
    expect(selectDocsVersions(["0.3.2", "0.3.3", "0.4.2", "0.4.3", "0.5.0"], ["^0.4.0", "0.3.2"])).toEqual({
      archived: ["0.4.3", "0.3.2"],
      current: "0.5.0",
    });
  });

  it("keeps nothing extra for an entry that matches only the current version", () => {
    expect(selectDocsVersions(["0.4.0", "0.5.0", "0.5.1"], ["^0.5.0"])).toEqual({ archived: [], current: "0.5.1" });
  });

  it("ignores pre-releases", () => {
    expect(selectDocsVersions(["1.0.0", "2.0.0-beta.1", "1.1.0-rc.1"], ["^1.0.0"])).toEqual({
      archived: [],
      current: "1.0.0",
    });
  });

  it("has no current version without a stable release", () => {
    expect(selectDocsVersions(["0.1.0-beta.1"])).toEqual({ archived: [] });
  });
});

describe("findUnmatchedDocsVersions", () => {
  it("returns entries no stable release satisfies", () => {
    expect(findUnmatchedDocsVersions(["0.4.0", "0.5.0-beta.1"], ["^0.4.0", "^0.5.0", "0.9.x"])).toEqual([
      "^0.5.0",
      "0.9.x",
    ]);
  });
});

describe("resolveDocsVersionRedirects", () => {
  it("follows a kept line, and sends everything else to the current version", () => {
    const versions = ["0.3.0", "0.4.2", "0.4.3", "0.5.0", "0.5.1"];
    expect(resolveDocsVersionRedirects(versions, { archived: ["0.4.3"], current: "0.5.1" })).toEqual([
      { from: "0.5.1" },
      { from: "0.5.0" },
      { from: "0.4.2", to: "0.4.3" },
      { from: "0.3.0" },
    ]);
  });

  it("does not send a release to an older kept version", () => {
    expect(resolveDocsVersionRedirects(["0.4.2", "0.4.3", "0.5.0"], { archived: ["0.4.2"], current: "0.5.0" })).toEqual(
      [{ from: "0.5.0" }, { from: "0.4.3" }],
    );
  });

  it("sends a release in the current major to the current version", () => {
    expect(resolveDocsVersionRedirects(["2.0.0", "2.1.0"], { archived: [], current: "2.1.0" })).toEqual([
      { from: "2.1.0" },
      { from: "2.0.0" },
    ]);
  });

  it("redirects nothing without a current version", () => {
    expect(resolveDocsVersionRedirects([], { archived: [] })).toEqual([]);
  });
});
