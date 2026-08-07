import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readToolVersion } from "./version.ts";

async function createManifestFixture(manifest: string): Promise<string> {
  const rootPath = await mkdtemp(path.join(tmpdir(), "codenhub-tool-version-"));
  const moduleDirectory = path.join(rootPath, "src", "cli");
  await mkdir(moduleDirectory, { recursive: true });
  await writeFile(path.join(rootPath, "package.json"), manifest);
  return moduleDirectory;
}

describe("readToolVersion", () => {
  it("shouldReportTheVersionDeclaredByTheOwnManifest", async () => {
    const moduleDirectory = await createManifestFixture(JSON.stringify({ name: "@codenhub/tools", version: "1.2.3" }));

    await expect(readToolVersion(moduleDirectory)).resolves.toBe("1.2.3");
  });

  it("shouldFailWhenTheManifestDeclaresNoVersion", async () => {
    const moduleDirectory = await createManifestFixture(JSON.stringify({ name: "@codenhub/tools" }));

    await expect(readToolVersion(moduleDirectory)).rejects.toThrow(/missing a "version" string/);
  });

  it("shouldMatchTheVersionOfTheInstalledTooling", async () => {
    await expect(readToolVersion()).resolves.toMatch(/^\d+\.\d+\.\d+/);
  });
});
