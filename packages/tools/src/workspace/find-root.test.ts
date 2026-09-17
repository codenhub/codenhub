import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { findWorkspaceRoot } from "./find-root.ts";

describe("findWorkspaceRoot", () => {
  it("shouldReturnTheDirectoryHoldingTheManifest", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "codenhub-find-root-"));
    await writeFile(resolve(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n', "utf8");

    expect(await findWorkspaceRoot(root)).toBe(root);
  });

  it("shouldWalkUpFromANestedDirectory", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "codenhub-find-root-"));
    await writeFile(resolve(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n', "utf8");
    const nested = resolve(root, "packages/example/src");
    await mkdir(nested, { recursive: true });

    expect(await findWorkspaceRoot(nested)).toBe(root);
  });

  it("shouldThrowWhenNoParentDirectoryHasTheManifest", async () => {
    const orphan = await mkdtemp(resolve(tmpdir(), "codenhub-find-root-orphan-"));

    await expect(findWorkspaceRoot(orphan)).rejects.toThrow("Could not find pnpm-workspace.yaml");
  });
});
