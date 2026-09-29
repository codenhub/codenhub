import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  materializeTreeAtRef,
  type DirectoryMaker,
  type GitTreeInvocation,
  type GitTreeRunner,
} from "./tag-content.ts";

const OPTIONS = {
  cwd: "/repo",
  destination: "/snapshot/packages/error",
  ref: "@codenhub/error@0.3.0",
  treePath: "packages/error",
};

const createDirectory = vi.fn<DirectoryMaker>(async () => undefined);

function createGit(outcomes: Record<string, { isSuccess: boolean; stdout?: string; output?: string }>) {
  return vi.fn<GitTreeRunner>(async ({ args }: GitTreeInvocation) => {
    const outcome = outcomes[args[0] ?? ""] ?? { isSuccess: true };
    return { isSuccess: outcome.isSuccess, stdout: outcome.stdout ?? "", output: outcome.output };
  });
}

describe("materializeTreeAtRef", () => {
  beforeEach(() => {
    createDirectory.mockClear();
  });

  it("stages the tree into a throwaway index and checks it out under the destination", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "tree\n" } });

    await expect(materializeTreeAtRef(OPTIONS, git, createDirectory)).resolves.toBe(true);

    const readTree = git.mock.calls.find(([{ args }]) => args[0] === "read-tree")?.[0];
    const checkout = git.mock.calls.find(([{ args }]) => args[0] === "checkout-index")?.[0];
    expect(readTree?.args).toEqual(["read-tree", "@codenhub/error@0.3.0:packages/error"]);
    expect(checkout?.args).toEqual(["checkout-index", "--all", "--force", "--prefix=/snapshot/packages/error/"]);
    expect(readTree?.env?.GIT_INDEX_FILE).toBeDefined();
    expect(checkout?.env?.GIT_INDEX_FILE).toBe(readTree?.env?.GIT_INDEX_FILE);
  });

  it("creates the destination itself before git writes into it, so sibling trees cannot race for a shared parent", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "tree\n" } });

    await materializeTreeAtRef(OPTIONS, git, createDirectory);

    const checkoutIndex = git.mock.calls.findIndex(([{ args }]) => args[0] === "checkout-index");
    expect(createDirectory).toHaveBeenCalledExactlyOnceWith("/snapshot/packages/error");
    expect(createDirectory.mock.invocationCallOrder[0]).toBeLessThan(
      git.mock.invocationCallOrder[checkoutIndex] as number,
    );
  });

  it("creates nothing when the directory did not exist at the ref", async () => {
    const git = createGit({ "cat-file": { isSuccess: false } });

    await materializeTreeAtRef(OPTIONS, git, createDirectory);

    expect(createDirectory).not.toHaveBeenCalled();
  });

  it("never writes through the repository's own index", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "tree\n" } });

    await materializeTreeAtRef(OPTIONS, git, createDirectory);

    const writes = git.mock.calls.filter(([{ args }]) => args[0] === "read-tree" || args[0] === "checkout-index");
    expect(writes.every(([{ env }]) => env?.GIT_INDEX_FILE !== undefined)).toBe(true);
  });

  it("writes Windows destinations with forward slashes and one trailing separator", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "tree\n" } });

    await materializeTreeAtRef({ ...OPTIONS, destination: "C:\\snapshot\\packages\\error\\" }, git, createDirectory);

    const checkout = git.mock.calls.find(([{ args }]) => args[0] === "checkout-index")?.[0];
    expect(checkout?.args.at(-1)).toBe("--prefix=C:/snapshot/packages/error/");
  });

  it("returns false without writing when the directory did not exist at the ref", async () => {
    const git = createGit({ "cat-file": { isSuccess: false } });

    await expect(materializeTreeAtRef(OPTIONS, git, createDirectory)).resolves.toBe(false);
    expect(git.mock.calls.some(([{ args }]) => args[0] === "checkout-index")).toBe(false);
  });

  it("throws when the ref cannot be read, rather than reporting an empty tree", async () => {
    const git = createGit({ "rev-parse": { isSuccess: false } });

    await expect(materializeTreeAtRef(OPTIONS, git, createDirectory)).rejects.toThrow(
      "Could not read @codenhub/error@0.3.0",
    );
  });

  it("throws when the path names a file rather than a directory", async () => {
    const git = createGit({ "cat-file": { isSuccess: true, stdout: "blob\n" } });

    await expect(materializeTreeAtRef(OPTIONS, git, createDirectory)).rejects.toThrow("is not a directory");
  });

  it("throws when git fails to write the files out", async () => {
    const git = createGit({
      "cat-file": { isSuccess: true, stdout: "tree\n" },
      "checkout-index": { isSuccess: false },
    });

    await expect(materializeTreeAtRef(OPTIONS, git, createDirectory)).rejects.toThrow("Could not write");
  });

  it("puts what git printed in the error, so a failed build names the cause", async () => {
    const git = createGit({
      "cat-file": { isSuccess: true, stdout: "tree\n" },
      "checkout-index": { isSuccess: false, output: "error: unable to create file a/b: No space left on device\n" },
    });

    await expect(materializeTreeAtRef(OPTIONS, git, createDirectory)).rejects.toThrow(
      "Could not write @codenhub/error@0.3.0:packages/error to /snapshot/packages/error.\nerror: unable to create file a/b: No space left on device",
    );
  });
});

describe("materializeTreeAtRef with real git", () => {
  const root = mkdtempSync(path.join(tmpdir(), "codenhub-tree-test-"));
  const repository = path.join(root, "repository");
  const siblings = ["a", "b", "c", "d", "e", "f"].map((name) => `packages/plugins/vite/${name}`);

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repository });

  mkdirSync(repository);
  git("init", "--quiet");
  for (const sibling of siblings) {
    mkdirSync(path.join(repository, sibling, "docs"), { recursive: true });
    writeFileSync(path.join(repository, sibling, "docs", "index.md"), `# ${sibling}\n`);
  }
  git("add", "--all");
  git("commit", "--quiet", "--message", "sibling packages");

  afterAll(() => rmSync(root, { force: true, recursive: true }));

  it("writes sibling trees that share a parent directory when they are materialized at once", async () => {
    const targets = Array.from({ length: 10 }, (_, round) => siblings.map((sibling) => ({ round, sibling }))).flat();

    const results = await Promise.all(
      targets.map(({ round, sibling }) =>
        materializeTreeAtRef({
          cwd: repository,
          destination: path.join(root, `snapshot-${round}`, sibling),
          ref: "HEAD",
          treePath: sibling,
        }),
      ),
    );

    expect(results).toEqual(targets.map(() => true));
    for (const { round, sibling } of targets) {
      const file = path.join(root, `snapshot-${round}`, sibling, "docs", "index.md");
      expect(readFileSync(file, "utf8")).toBe(`# ${sibling}\n`);
    }
  });
});
