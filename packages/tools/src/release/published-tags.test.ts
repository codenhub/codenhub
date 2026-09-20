import { describe, expect, it, vi } from "vitest";

import { fetchReleaseTags, listTags, resolveLatestPublishedTag, type GitRunner } from "./published-tags.ts";

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

  it("returns nothing when git fails", async () => {
    const git = vi.fn<GitRunner>().mockResolvedValue({ isSuccess: false, stdout: "" });
    await expect(listTags("/repo", git)).resolves.toEqual([]);
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

  it("ignores tags that are not release tags", () => {
    expect(resolveLatestPublishedTag("@codenhub/error", ["v1.0.0", "release"])).toBeUndefined();
  });
});
