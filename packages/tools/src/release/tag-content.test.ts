import { describe, expect, it, vi } from "vitest";

import { materializeTreeAtRef, type GitTreeInvocation, type GitTreeRunner } from "./tag-content.ts";

const OPTIONS = {
  cwd: "/repo",
  destination: "/snapshot/packages/error",
  ref: "@codenhub/error@0.3.0",
  treePath: "packages/error",
};

function createGit(outcomes: Record<string, { isSuccess: boolean; stdout?: string }>) {
  return vi.fn<GitTreeRunner>(async ({ args }: GitTreeInvocation) => {
    const outcome = outcomes[args[0] ?? ""] ?? { isSuccess: true };
    return { isSuccess: outcome.isSuccess, stdout: outcome.stdout ?? "" };
  });
}

describe("materializeTreeAtRef", () => {
  it("stages the tree into a throwaway index and checks it out under the destination", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "tree\n" } });

    await expect(materializeTreeAtRef(OPTIONS, git)).resolves.toBe(true);

    const readTree = git.mock.calls.find(([{ args }]) => args[0] === "read-tree")?.[0];
    const checkout = git.mock.calls.find(([{ args }]) => args[0] === "checkout-index")?.[0];
    expect(readTree?.args).toEqual(["read-tree", "@codenhub/error@0.3.0:packages/error"]);
    expect(checkout?.args).toEqual(["checkout-index", "--all", "--force", "--prefix=/snapshot/packages/error/"]);
    expect(readTree?.env?.GIT_INDEX_FILE).toBeDefined();
    expect(checkout?.env?.GIT_INDEX_FILE).toBe(readTree?.env?.GIT_INDEX_FILE);
  });

  it("never writes through the repository's own index", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "tree\n" } });

    await materializeTreeAtRef(OPTIONS, git);

    const writes = git.mock.calls.filter(([{ args }]) => args[0] === "read-tree" || args[0] === "checkout-index");
    expect(writes.every(([{ env }]) => env?.GIT_INDEX_FILE !== undefined)).toBe(true);
  });

  it("writes Windows destinations with forward slashes and one trailing separator", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "tree\n" } });

    await materializeTreeAtRef({ ...OPTIONS, destination: "C:\\snapshot\\packages\\error\\" }, git);

    const checkout = git.mock.calls.find(([{ args }]) => args[0] === "checkout-index")?.[0];
    expect(checkout?.args.at(-1)).toBe("--prefix=C:/snapshot/packages/error/");
  });

  it("returns false without writing when the directory did not exist at the ref", async () => {
    const git = createGit({ "cat-file": { isSuccess: false } });

    await expect(materializeTreeAtRef(OPTIONS, git)).resolves.toBe(false);
    expect(git.mock.calls.some(([{ args }]) => args[0] === "checkout-index")).toBe(false);
  });

  it("throws when the ref cannot be read, rather than reporting an empty tree", async () => {
    const git = createGit({ "rev-parse": { isSuccess: false } });

    await expect(materializeTreeAtRef(OPTIONS, git)).rejects.toThrow("Could not read @codenhub/error@0.3.0");
  });

  it("throws when the path names a file rather than a directory", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "blob\n" } });

    await expect(materializeTreeAtRef(OPTIONS, git)).rejects.toThrow("is not a directory");
  });

  it("throws when git fails to write the files out", async () => {
    const git = createGit({
      "cat-file": { isSuccess: true, stdout: "tree\n" },
      "checkout-index": { isSuccess: false },
    });

    await expect(materializeTreeAtRef(OPTIONS, git)).rejects.toThrow("Could not write");
  });
});
