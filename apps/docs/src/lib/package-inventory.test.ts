import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { readNpmPackInventory } from "./package-inventory";

describe("npm package publication inventory", () => {
  it("uses npm pack dry-run JSON output as the inventory source", async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([{ files: [{ path: "README.md" }, { path: "docs/index.md" }] }]),
    });

    await expect(readNpmPackInventory("C:/repo/packages/example", runCommand)).resolves.toEqual(
      new Set(["README.md", "docs/index.md"]),
    );
    expect(runCommand).toHaveBeenCalledWith("npm", ["pack", "--dry-run", "--json"], "C:/repo/packages/example");
  });

  it("rejects malformed npm pack output", async () => {
    const runCommand = vi.fn().mockResolvedValue({ stdout: "{}" });

    await expect(readNpmPackInventory("C:/repo/packages/example", runCommand)).rejects.toThrow(
      "Invalid npm pack inventory",
    );
  });

  it("executes npm pack for a local package without a network request", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "codenhub-pack-"));
    await writeFile(
      path.join(rootPath, "package.json"),
      JSON.stringify({ name: "codenhub-pack-fixture", version: "1.0.0" }),
    );
    await writeFile(path.join(rootPath, "README.md"), "# Fixture");

    await expect(readNpmPackInventory(rootPath)).resolves.toContain("README.md");
  });
});
