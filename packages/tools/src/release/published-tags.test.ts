import { describe, expect, it, vi } from "vitest";

import {
  collectReleases,
  fetchReleaseTags,
  listTagDates,
  listTags,
  resolveLatestPublishedTag,
  type GitRunner,
} from "./published-tags.ts";

describe("fetchReleaseTags", () => {
  it("runs a forced tag fetch from origin", async () => {
    const git = vi.fn<GitRunner>().mockResolvedValue({ isSuccess: true, stdout: "" });
    await expect(fetchReleaseTags("/repo", git)).resolves.toBe(true);
    expect(git).toHaveBeenCalledWith(["fetch", "--tags", "--force", "origin"], "/repo");
  });

  it("reports failure without throwing", async () => {
    const git = vi.fn<GitRunner>().mockResolvedValue({ isSuccess: false, stdout: "" });
    await expect(fetchReleaseTags("/repo", git)).resolves.toBe(false);
  });
});

describe("listTags", () => {
  it("splits tag output into trimmed, non-empty lines", async () => {
    const git = vi.fn<GitRunner>().mockResolvedValue({
      isSuccess: true,
      stdout: "@codenhub/error@0.3.0\n@codenhub/error@0.2.0\n\n",
    });
    await expect(listTags("/repo", git)).resolves.toEqual(["@codenhub/error@0.3.0", "@codenhub/error@0.2.0"]);
  });

  it("throws when git fails, rather than reporting an empty tag list", async () => {
    const git = vi.fn<GitRunner>().mockResolvedValue({ isSuccess: false, stdout: "" });
    await expect(listTags("/repo", git)).rejects.toThrow("Could not list git tags");
  });
});

describe("resolveLatestPublishedTag", () => {
  it("picks the newest version for the named package", () => {
    const tags = ["@codenhub/error@0.2.0", "@codenhub/error@0.10.0", "@codenhub/error@0.3.0"];
    expect(resolveLatestPublishedTag("@codenhub/error", tags)).toBe("@codenhub/error@0.10.0");
  });

  it("ignores tags for other packages", () => {
    const tags = ["@codenhub/icons@1.0.0", "@codenhub/error@0.1.0"];
    expect(resolveLatestPublishedTag("@codenhub/error", tags)).toBe("@codenhub/error@0.1.0");
  });

  it("ignores a package name that is a prefix of another package's tag", () => {
    const tags = ["@codenhub/error-extra@1.0.0"];
    expect(resolveLatestPublishedTag("@codenhub/error", tags)).toBeUndefined();
  });

  it("returns undefined when the package has never published", () => {
    expect(resolveLatestPublishedTag("@codenhub/error", ["@codenhub/icons@1.0.0"])).toBeUndefined();
  });

  it("skips a pre-release newer than the latest stable release", () => {
    const tags = ["@codenhub/error@0.3.0", "@codenhub/error@0.3.1-beta.1", "@codenhub/error@1.0.0-rc.1"];
    expect(resolveLatestPublishedTag("@codenhub/error", tags)).toBe("@codenhub/error@0.3.0");
  });

  it("treats a package with only pre-release tags as unpublished", () => {
    expect(resolveLatestPublishedTag("@codenhub/error", ["@codenhub/error@0.1.0-beta.1"])).toBeUndefined();
  });

  it("ignores tags that are not release tags", () => {
    expect(resolveLatestPublishedTag("@codenhub/error", ["v1.0.0", "release"])).toBeUndefined();
  });
});

describe("listTagDates", () => {
  it("maps each tag to the date git reports for it", async () => {
    const git = vi.fn<GitRunner>().mockResolvedValue({
      isSuccess: true,
      stdout: "@codenhub/error@0.3.0\t2026-10-09T12:00:00+00:00\n\n",
    });
    await expect(listTagDates("/repo", git)).resolves.toEqual(
      new Map([["@codenhub/error@0.3.0", "2026-10-09T12:00:00+00:00"]]),
    );
    // The peeled date covers an annotated tag; the plain one a lightweight tag.
    expect(git).toHaveBeenCalledWith(
      [
        "for-each-ref",
        "--format=%(refname:short)%09%(*committerdate:iso-strict)%(committerdate:iso-strict)",
        "refs/tags",
      ],
      "/repo",
    );
  });

  it("throws on a tag with no commit date, rather than leaving its release out", async () => {
    const git = vi.fn<GitRunner>().mockResolvedValue({ isSuccess: true, stdout: "@codenhub/error@0.3.0\t\n" });
    await expect(listTagDates("/repo", git)).rejects.toThrow('tag "@codenhub/error@0.3.0"');
  });

  it("throws when git fails, rather than reporting no tags", async () => {
    const git = vi.fn<GitRunner>().mockResolvedValue({ isSuccess: false, stdout: "" });
    await expect(listTagDates("/repo", git)).rejects.toThrow("Could not list git tags");
  });
});

describe("collectReleases", () => {
  it("lists one package's releases, newest version first, marking pre-releases", () => {
    const tagDates = new Map([
      // Dated after 0.10.0, so only a version sort puts it last.
      ["@codenhub/error@0.2.0", "2026-10-05T00:00:00+00:00"],
      ["@codenhub/error@0.10.0", "2026-10-01T00:00:00+00:00"],
      ["@codenhub/error@0.10.1+build.5", "2026-10-02T00:00:00+00:00"],
      ["@codenhub/error@0.11.0-beta.1", "2026-10-10T00:00:00+00:00"],
      ["@codenhub/errors@1.0.0", "2026-10-11T00:00:00+00:00"],
      ["v1.0.0", "2026-01-01T00:00:00+00:00"],
    ]);

    expect(collectReleases("@codenhub/error", tagDates)).toEqual([
      { date: "2026-10-10T00:00:00+00:00", isPrerelease: true, version: "0.11.0-beta.1" },
      { date: "2026-10-02T00:00:00+00:00", isPrerelease: false, version: "0.10.1+build.5" },
      { date: "2026-10-01T00:00:00+00:00", isPrerelease: false, version: "0.10.0" },
      { date: "2026-10-05T00:00:00+00:00", isPrerelease: false, version: "0.2.0" },
    ]);
  });
});
