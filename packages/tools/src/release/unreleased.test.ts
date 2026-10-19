import { describe, expect, it, vi } from "vitest";

import type { GitRunner } from "./published-tags.ts";
import { readUnreleasedChanges, resolveLatestReleaseTag } from "./unreleased.ts";

describe("resolveLatestReleaseTag", () => {
  it("picks the newest version of the package, pre-releases included", () => {
    const tags = ["@codenhub/error@0.2.0", "@codenhub/error@0.3.0-beta.1", "@codenhub/error@0.2.1", "v1.0.0"];

    expect(resolveLatestReleaseTag("@codenhub/error", tags)).toBe("@codenhub/error@0.3.0-beta.1");
  });

  it("skips a tag whose version is not a semantic version", () => {
    expect(resolveLatestReleaseTag("@codenhub/error", ["@codenhub/error@1.0.0", "@codenhub/error@junk"])).toBe(
      "@codenhub/error@1.0.0",
    );
  });

  it("ignores other packages' tags", () => {
    expect(resolveLatestReleaseTag("@codenhub/error", ["@codenhub/errors@9.0.0"])).toBeUndefined();
  });
});

/** Answers `git tag --list` with `tags` and `git log` with `log`, recording every call. */
function fakeGit(tags: readonly string[], log: string): GitRunner {
  return vi.fn<GitRunner>(async (args) =>
    args[0] === "tag" ? { isSuccess: true, stdout: tags.join("\n") } : { isSuccess: true, stdout: log },
  );
}

describe("readUnreleasedChanges", () => {
  it("lists the package's non-merge commits since its newest release tag", async () => {
    const git = fakeGit(["@codenhub/error@0.2.1"], "abc1234\tfix(error): keep the cause\ndef5678\tdocs(error): note\n");

    const changes = await readUnreleasedChanges("@codenhub/error", "packages/error", "/repo", git);

    expect(git).toHaveBeenCalledWith(
      ["log", "--no-merges", "--format=%h%x09%s", "@codenhub/error@0.2.1..HEAD", "--", "packages/error"],
      "/repo",
    );
    expect(changes).toEqual({
      commits: [
        { hash: "abc1234", subject: "fix(error): keep the cause" },
        { hash: "def5678", subject: "docs(error): note" },
      ],
      tag: "@codenhub/error@0.2.1",
    });
  });

  it("lists every commit of a package that was never released", async () => {
    const git = fakeGit([], "abc1234\tfeat(kbd): first\n");

    const changes = await readUnreleasedChanges("@codenhub/kbd", "packages/kbd", "/repo", git);

    expect(git).toHaveBeenCalledWith(
      ["log", "--no-merges", "--format=%h%x09%s", "HEAD", "--", "packages/kbd"],
      "/repo",
    );
    expect(changes).toEqual({ commits: [{ hash: "abc1234", subject: "feat(kbd): first" }], tag: undefined });
  });

  it("throws when git cannot report the history", async () => {
    const git = vi.fn<GitRunner>(async (args) =>
      args[0] === "tag" ? { isSuccess: true, stdout: "" } : { isSuccess: false, stdout: "" },
    );

    await expect(readUnreleasedChanges("@codenhub/kbd", "packages/kbd", "/repo", git)).rejects.toThrow(
      "Could not read the history of packages/kbd",
    );
  });
});
