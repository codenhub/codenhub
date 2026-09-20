import { describe, expect, it, vi } from "vitest";

import { listFilesAtRef, readFileAtRef, type GitContentReader } from "./tag-content.ts";

describe("listFilesAtRef", () => {
  it("splits the tree listing into trimmed, non-empty paths", async () => {
    const git = vi.fn<GitContentReader>().mockResolvedValue({
      isSuccess: true,
      stdout: "packages/error/docs/index.md\npackages/error/docs/reference.md\n\n",
    });
    await expect(listFilesAtRef("/repo", "@codenhub/error@0.3.0", "packages/error/docs", git)).resolves.toEqual([
      "packages/error/docs/index.md",
      "packages/error/docs/reference.md",
    ]);
    expect(git).toHaveBeenCalledWith(
      ["ls-tree", "-r", "--name-only", "@codenhub/error@0.3.0", "--", "packages/error/docs"],
      "/repo",
    );
  });

  it("returns nothing when git fails", async () => {
    const git = vi.fn<GitContentReader>().mockResolvedValue({ isSuccess: false, stdout: "" });
    await expect(listFilesAtRef("/repo", "missing-tag", "packages/error/docs", git)).resolves.toEqual([]);
  });
});

describe("readFileAtRef", () => {
  it("returns the file content as committed at the ref, unmodified", async () => {
    const git = vi.fn<GitContentReader>().mockResolvedValue({ isSuccess: true, stdout: "# Error\n\nBody.\n" });
    await expect(readFileAtRef("/repo", "@codenhub/error@0.3.0", "packages/error/docs/index.md", git)).resolves.toBe(
      "# Error\n\nBody.\n",
    );
    expect(git).toHaveBeenCalledWith(["show", "@codenhub/error@0.3.0:packages/error/docs/index.md"], "/repo");
  });

  it("returns undefined when the file cannot be read at that ref", async () => {
    const git = vi.fn<GitContentReader>().mockResolvedValue({ isSuccess: false, stdout: "" });
    await expect(readFileAtRef("/repo", "missing-tag", "packages/error/docs/index.md", git)).resolves.toBeUndefined();
  });
});
