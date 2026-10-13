import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { ASSET_STATE_FILE, declaresAssets, syncPackageAssets } from "./sync.ts";

/** True on file systems where `PROBE.txt` finds `probe.txt` (Windows, macOS by default). */
const caseInsensitiveFileSystem = (() => {
  const probeDirectory = mkdtempSync(join(tmpdir(), "codenhub-assets-case-probe-"));
  writeFileSync(join(probeDirectory, "probe.txt"), "");
  const insensitive = existsSync(join(probeDirectory, "PROBE.txt"));
  rmSync(probeDirectory, { force: true, recursive: true });
  return insensitive;
})();

function createPackage(directory: string, manifest: Record<string, unknown>): WorkspacePackage {
  return {
    directory,
    directoryName: "example",
    isPrivate: true,
    location: "apps/example",
    manifest,
    name: "@fixture/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

async function readJsonState(packageDirectory: string): Promise<unknown> {
  return JSON.parse(await readFile(join(packageDirectory, ASSET_STATE_FILE), "utf8"));
}

async function createFixture(): Promise<{ packageDirectory: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-assets-root-"));
  await mkdir(join(root, "assets", "favicon"), { recursive: true });
  await mkdir(join(root, "assets", "logo"), { recursive: true });
  await writeFile(join(root, "assets", "favicon", "favicon.ico"), "favicon-bytes");
  await writeFile(join(root, "assets", "logo", "logo-dark.svg"), "logo-bytes");
  const packageDirectory = await mkdtemp(join(tmpdir(), "codenhub-assets-package-"));
  return { packageDirectory, root };
}

describe("declaresAssets", () => {
  it("shouldBeFalseWhenNothingIsDeclared", () => {
    expect(declaresAssets(createPackage("/repo/apps/example", { name: "@fixture/example" }))).toBe(false);
  });

  it("shouldBeTrueWhenAtLeastOneEntryIsDeclared", () => {
    const manifest = { codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] } };
    expect(declaresAssets(createPackage("/repo/apps/example", manifest))).toBe(true);
  });
});

describe("syncPackageAssets", () => {
  it("shouldCopyEveryDeclaredEntryToItsOwnDestination", async () => {
    const { packageDirectory, root } = await createFixture();
    const workspacePackage = createPackage(packageDirectory, {
      codenhub: {
        assets: [
          { from: "favicon/favicon.ico", to: "public/favicon.ico" },
          { from: "logo/logo-dark.svg", to: "public/assets/logo/logo-dark.svg" },
        ],
      },
      name: "@fixture/example",
    });

    const result = await syncPackageAssets(workspacePackage, root);

    expect(result).toEqual({
      copied: ["public/favicon.ico", "public/assets/logo/logo-dark.svg"],
      removed: [],
    });
    await expect(readFile(join(packageDirectory, "public/favicon.ico"), "utf8")).resolves.toBe("favicon-bytes");
    await expect(readFile(join(packageDirectory, "public/assets/logo/logo-dark.svg"), "utf8")).resolves.toBe(
      "logo-bytes",
    );
  });

  it("shouldRemoveAFileWhoseEntryWasDropped", async () => {
    const { packageDirectory, root } = await createFixture();
    const withBoth = createPackage(packageDirectory, {
      codenhub: {
        assets: [
          { from: "favicon/favicon.ico", to: "public/favicon.ico" },
          { from: "logo/logo-dark.svg", to: "public/assets/logo/logo-dark.svg" },
        ],
      },
      name: "@fixture/example",
    });
    await syncPackageAssets(withBoth, root);

    const withOnlyFavicon = createPackage(packageDirectory, {
      codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      name: "@fixture/example",
    });
    const result = await syncPackageAssets(withOnlyFavicon, root);

    expect(result).toEqual({ copied: ["public/favicon.ico"], removed: ["public/assets/logo/logo-dark.svg"] });
    await expect(readFile(join(packageDirectory, "public/assets/logo/logo-dark.svg"), "utf8")).rejects.toThrow(
      "ENOENT",
    );
    await expect(readFile(join(packageDirectory, "public/favicon.ico"), "utf8")).resolves.toBe("favicon-bytes");
  });

  it("shouldNeverTouchAFileItDidNotPlaceItself", async () => {
    const { packageDirectory, root } = await createFixture();
    await mkdir(join(packageDirectory, "public"), { recursive: true });
    await writeFile(join(packageDirectory, "public", "hand-authored.txt"), "keep me");
    const workspacePackage = createPackage(packageDirectory, {
      codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      name: "@fixture/example",
    });

    await syncPackageAssets(workspacePackage, root);
    await syncPackageAssets(createPackage(packageDirectory, { name: "@fixture/example" }), root);

    await expect(readFile(join(packageDirectory, "public/hand-authored.txt"), "utf8")).resolves.toBe("keep me");
  });

  it("shouldRemoveTheStateFileOnceNothingIsDeclared", async () => {
    const { packageDirectory, root } = await createFixture();
    const withEntry = createPackage(packageDirectory, {
      codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      name: "@fixture/example",
    });
    await syncPackageAssets(withEntry, root);
    await expect(readFile(join(packageDirectory, ASSET_STATE_FILE), "utf8")).resolves.not.toBe("");

    await syncPackageAssets(createPackage(packageDirectory, { name: "@fixture/example" }), root);

    await expect(readFile(join(packageDirectory, ASSET_STATE_FILE), "utf8")).rejects.toThrow("ENOENT");
  });

  it("shouldNotDeleteAFileOutsideThePackageDirectoryFromACorruptedStateFile", async () => {
    const { packageDirectory, root } = await createFixture();
    const sentinelPath = join(packageDirectory, "..", `codenhub-assets-sentinel-${basename(packageDirectory)}.txt`);
    await writeFile(sentinelPath, "do not delete me");
    try {
      // Not a destination any manifest declared: a corrupted or hand-edited
      // state file smuggling a traversal path in, the way an attacker or a
      // bad merge could.
      await writeFile(
        join(packageDirectory, ASSET_STATE_FILE),
        JSON.stringify({ placed: [`../${basename(sentinelPath)}`] }),
      );

      const result = await syncPackageAssets(createPackage(packageDirectory, { name: "@fixture/example" }), root);

      expect(result.removed).toEqual([]);
      await expect(readFile(sentinelPath, "utf8")).resolves.toBe("do not delete me");
    } finally {
      await rm(sentinelPath, { force: true });
    }
  });

  it("shouldRecordEveryCopyThatSucceededWhenAnotherCopyFails", async () => {
    const { packageDirectory, root } = await createFixture();
    await syncPackageAssets(
      createPackage(packageDirectory, {
        codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
        name: "@fixture/example",
      }),
      root,
    );
    // Read-only makes the rewrite of this placed file fail on Windows (EPERM) and POSIX (EACCES).
    await chmod(join(packageDirectory, "public/favicon.ico"), 0o444);
    const workspacePackage = createPackage(packageDirectory, {
      codenhub: {
        assets: [
          { from: "favicon/favicon.ico", to: "public/favicon.ico" },
          { from: "logo/logo-dark.svg", to: "public/logo.svg" },
        ],
      },
      name: "@fixture/example",
    });

    await expect(syncPackageAssets(workspacePackage, root)).rejects.toMatchObject({
      code: expect.stringMatching(/^(EPERM|EACCES)$/),
    });
    await expect(readFile(join(packageDirectory, "public/logo.svg"), "utf8")).resolves.toBe("logo-bytes");
    await expect(readJsonState(packageDirectory)).resolves.toEqual({
      placed: ["public/favicon.ico", "public/logo.svg"],
    });

    await chmod(join(packageDirectory, "public/favicon.ico"), 0o644);
    await expect(syncPackageAssets(workspacePackage, root)).resolves.toEqual({
      copied: ["public/favicon.ico", "public/logo.svg"],
      removed: [],
    });
  });

  it("shouldRecordARemovalThatSucceededWhenACopyFails", async () => {
    const { packageDirectory, root } = await createFixture();
    await syncPackageAssets(
      createPackage(packageDirectory, {
        codenhub: {
          assets: [
            { from: "favicon/favicon.ico", to: "public/favicon.ico" },
            { from: "logo/logo-dark.svg", to: "public/logo.svg" },
          ],
        },
        name: "@fixture/example",
      }),
      root,
    );
    await chmod(join(packageDirectory, "public/favicon.ico"), 0o444);

    await expect(
      syncPackageAssets(
        createPackage(packageDirectory, {
          codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
          name: "@fixture/example",
        }),
        root,
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(EPERM|EACCES)$/) });

    await expect(readJsonState(packageDirectory)).resolves.toEqual({ placed: ["public/favicon.ico"] });
    await expect(readFile(join(packageDirectory, "public/logo.svg"), "utf8")).rejects.toThrow("ENOENT");
    await chmod(join(packageDirectory, "public/favicon.ico"), 0o644);
  });

  it("shouldThrowWhenADeclaredSourceDoesNotExist", async () => {
    const { packageDirectory, root } = await createFixture();
    const workspacePackage = createPackage(packageDirectory, {
      codenhub: { assets: [{ from: "favicon/missing.ico", to: "public/favicon.ico" }] },
      name: "@fixture/example",
    });

    await expect(syncPackageAssets(workspacePackage, root)).rejects.toThrow(/does not exist under assets\//);
  });

  it("shouldRejectAnExistingDestinationItDidNotPlace", async () => {
    const { packageDirectory, root } = await createFixture();
    await mkdir(join(packageDirectory, "public"), { recursive: true });
    await writeFile(join(packageDirectory, "public", "favicon.ico"), "hand-authored");
    const workspacePackage = createPackage(packageDirectory, {
      codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      name: "@fixture/example",
    });

    await expect(syncPackageAssets(workspacePackage, root)).rejects.toThrow(/did not place/);
    await expect(readFile(join(packageDirectory, "public", "favicon.ico"), "utf8")).resolves.toBe("hand-authored");
  });

  it("shouldValidateAllSourcesBeforeRemovingDroppedAssets", async () => {
    const { packageDirectory, root } = await createFixture();
    await syncPackageAssets(
      createPackage(packageDirectory, {
        codenhub: { assets: [{ from: "logo/logo-dark.svg", to: "public/logo.svg" }] },
        name: "@fixture/example",
      }),
      root,
    );
    const invalidUpdate = createPackage(packageDirectory, {
      codenhub: { assets: [{ from: "favicon/missing.ico", to: "public/favicon.ico" }] },
      name: "@fixture/example",
    });

    await expect(syncPackageAssets(invalidUpdate, root)).rejects.toThrow(/does not exist under assets\//);
    await expect(readFile(join(packageDirectory, "public", "logo.svg"), "utf8")).resolves.toBe("logo-bytes");
  });

  it("shouldRejectASourceThatResolvesOutsideTheAssetsDirectory", async () => {
    const { packageDirectory, root } = await createFixture();
    const outsideDirectory = await mkdtemp(join(tmpdir(), "codenhub-assets-outside-source-"));
    await writeFile(join(outsideDirectory, "secret.txt"), "secret");
    await symlink(outsideDirectory, join(root, "assets", "linked"), "junction");
    const workspacePackage = createPackage(packageDirectory, {
      codenhub: { assets: [{ from: "linked/secret.txt", to: "public/secret.txt" }] },
      name: "@fixture/example",
    });

    await expect(syncPackageAssets(workspacePackage, root)).rejects.toThrow(/resolves outside assets\//);
  });

  it("shouldRejectADestinationThroughASymbolicLinkParent", async () => {
    const { packageDirectory, root } = await createFixture();
    const firstManifest = createPackage(packageDirectory, {
      codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      name: "@fixture/example",
    });
    await syncPackageAssets(firstManifest, root);
    await rm(join(packageDirectory, "public"), { recursive: true });
    const outsideDirectory = await mkdtemp(join(tmpdir(), "codenhub-assets-outside-destination-"));
    await symlink(outsideDirectory, join(packageDirectory, "public"), "junction");

    await expect(syncPackageAssets(firstManifest, root)).rejects.toThrow(/symbolic link/);
    await expect(readFile(join(outsideDirectory, "favicon.ico"), "utf8")).rejects.toThrow("ENOENT");
  });

  it("shouldAdoptItsOwnFileWhenOnlyTheLetterCaseOfItsDestinationChanges", async () => {
    const { packageDirectory, root } = await createFixture();
    await syncPackageAssets(
      createPackage(packageDirectory, {
        codenhub: { assets: [{ from: "logo/logo-dark.svg", to: "public/logo.svg" }] },
        name: "@fixture/example",
      }),
      root,
    );

    const result = await syncPackageAssets(
      createPackage(packageDirectory, {
        codenhub: { assets: [{ from: "logo/logo-dark.svg", to: "public/Logo.svg" }] },
        name: "@fixture/example",
      }),
      root,
    );

    expect(result).toEqual({ copied: ["public/Logo.svg"], removed: ["public/logo.svg"] });
    // The exact on-disk name: the new casing must survive, so the old name
    // must be removed before the new one is copied.
    await expect(readdir(join(packageDirectory, "public"))).resolves.toEqual(["Logo.svg"]);
    await expect(readFile(join(packageDirectory, "public/Logo.svg"), "utf8")).resolves.toBe("logo-bytes");
    await expect(readJsonState(packageDirectory)).resolves.toEqual({ placed: ["public/Logo.svg"] });
  });

  it.skipIf(caseInsensitiveFileSystem)("shouldStillRefuseACaseVariantThatIsNotThePlacedFile", async () => {
    const { packageDirectory, root } = await createFixture();
    await syncPackageAssets(
      createPackage(packageDirectory, {
        codenhub: { assets: [{ from: "logo/logo-dark.svg", to: "public/logo.svg" }] },
        name: "@fixture/example",
      }),
      root,
    );
    // On a case-sensitive file system this is a different file from the placed one.
    await writeFile(join(packageDirectory, "public", "Logo.svg"), "hand-authored");

    await expect(
      syncPackageAssets(
        createPackage(packageDirectory, {
          codenhub: { assets: [{ from: "logo/logo-dark.svg", to: "public/Logo.svg" }] },
          name: "@fixture/example",
        }),
        root,
      ),
    ).rejects.toThrow(/did not place/);
    await expect(readFile(join(packageDirectory, "public", "Logo.svg"), "utf8")).resolves.toBe("hand-authored");
    await expect(readFile(join(packageDirectory, "public", "logo.svg"), "utf8")).resolves.toBe("logo-bytes");
  });
});
