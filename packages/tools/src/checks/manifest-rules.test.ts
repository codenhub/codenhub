import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createManifestRules } from "./manifest-rules.ts";
import type { Finding } from "./rule.ts";

const COMPLIANT_MANIFEST = {
  codenhub: { docs: { label: "Example", status: "active" } },
  description: "An example package.",
  exports: { ".": "./dist/index.js" },
  files: ["dist"],
  license: "Apache-2.0",
  main: "./dist/index.js",
  module: "./dist/index.js",
  name: "@fixture/example",
  private: false,
  publishConfig: { access: "public" },
  repository: "https://example.com/repo",
  type: "module",
  types: "./dist/index.d.ts",
  version: "1.0.0",
};

const COMPLIANT_SCRIPTS = {
  build: "tsc",
  prepublishOnly: "pnpm build && pnpm typecheck",
  "status:npm": "npm view @fixture/example",
  "status:pack": "npm pack --dry-run --ignore-scripts",
  test: "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:watch": "vitest",
  typecheck: "tsc --noEmit",
};

/**
 * Creates a package directory on disk.
 *
 * Two rules read files rather than the manifest — the license file and the
 * Playwright config — so a fixture needs a real directory to be read from.
 * @param files Package-relative file names to create.
 * @returns Absolute package directory.
 */
async function createPackageDirectory(files: readonly string[] = ["LICENSE"]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-manifest-"));
  await Promise.all(files.map(async (file) => writeFile(join(directory, file), "")));
  return directory;
}

function createPackage(overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  const manifest = { ...COMPLIANT_MANIFEST, scripts: COMPLIANT_SCRIPTS, ...overrides.manifest };
  return {
    directory: "/repo/packages/example",
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest,
    name: "@fixture/example",
    scripts: (manifest.scripts ?? {}) as Record<string, string>,
    unscopedName: "example",
    workspaceDependencies: [],
    ...overrides,
  };
}

async function runRules(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  const applicable = createManifestRules().filter((rule) => rule.appliesTo(workspacePackage));
  const findings = await Promise.all(
    applicable.map(async (rule) => rule.run({ includePack: false, package: workspacePackage })),
  );
  return findings.flat();
}

describe("manifest rules", () => {
  it("shouldAcceptACompliantPublishedPackage", async () => {
    const directory = await createPackageDirectory();

    await expect(runRules(createPackage({ directory }))).resolves.toEqual([]);
  });

  it("shouldReportEveryMissingRequiredMetadataField", async () => {
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(),
      manifest: { name: "@fixture/example", scripts: COMPLIANT_SCRIPTS },
    });

    expect((await runRules(workspacePackage)).map(({ code }) => code)).toEqual([
      "metadata/version",
      "metadata/main",
      "metadata/module",
      "metadata/types",
      "metadata/private",
      "metadata/type",
      "metadata/files",
      "metadata/exports",
      "metadata/publish-config",
      "metadata/docs",
      "metadata/description",
      "metadata/license",
      "metadata/repository",
    ]);
  });

  it("shouldTreatRecommendedFieldsAsWarnings", async () => {
    const manifest = { ...COMPLIANT_MANIFEST, scripts: COMPLIANT_SCRIPTS, license: undefined };
    const findings = await runRules(createPackage({ directory: await createPackageDirectory(), manifest }));

    expect(findings).toEqual([
      { code: "metadata/license", location: "package.json", message: `Should declare "license".`, severity: "warning" },
    ]);
  });

  it("shouldReportAMissingLicenseFileAsAWarning", async () => {
    const findings = await runRules(createPackage({ directory: await createPackageDirectory([]) }));

    expect(findings).toEqual([
      {
        code: "metadata/license-file",
        location: "LICENSE",
        message: `Should ship a LICENSE file alongside the "license" field.`,
        severity: "warning",
      },
    ]);
  });

  it("shouldRequirePrivateToBeDeclaredAsFalse", async () => {
    const manifest = { ...COMPLIANT_MANIFEST, private: undefined, scripts: COMPLIANT_SCRIPTS };
    const findings = await runRules(createPackage({ directory: await createPackageDirectory(), manifest }));

    expect(findings.map(({ code }) => code)).toEqual(["metadata/private"]);
  });

  it("shouldRequireACoverageScript", async () => {
    const scripts = { ...COMPLIANT_SCRIPTS, "test:coverage": undefined };
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(),
      manifest: { ...COMPLIANT_MANIFEST, scripts },
    });

    expect((await runRules(workspacePackage)).map(({ code }) => code)).toEqual(["scripts/test:coverage"]);
  });

  it("shouldRejectAScriptThatChainsABuild", async () => {
    const scripts = { ...COMPLIANT_SCRIPTS, test: "pnpm build && vitest run" };
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(),
      manifest: { ...COMPLIANT_MANIFEST, scripts },
    });

    expect((await runRules(workspacePackage)).map(({ code }) => code)).toEqual(["scripts/build-chain"]);
  });

  it("shouldCheckTheBuildChainRuleForPrivatePackagesToo", async () => {
    const scripts = { typecheck: "pnpm run build && tsc --noEmit" };
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(),
      isPrivate: true,
      manifest: { name: "@fixture/private", scripts },
    });

    expect((await runRules(workspacePackage)).map(({ code }) => code)).toEqual(["scripts/build-chain"]);
  });

  it("shouldNotReadANamespacedBuildScriptAsAChainedBuild", async () => {
    const scripts = { ...COMPLIANT_SCRIPTS, test: "pnpm build:fixtures && vitest run" };
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(),
      manifest: { ...COMPLIANT_MANIFEST, scripts },
    });

    await expect(runRules(workspacePackage)).resolves.toEqual([]);
  });

  it("shouldRequirePrepublishOnlyToStaySelfContained", async () => {
    const scripts = { ...COMPLIANT_SCRIPTS, prepublishOnly: "pnpm typecheck" };
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(),
      manifest: { ...COMPLIANT_MANIFEST, scripts },
    });

    expect((await runRules(workspacePackage)).map(({ code }) => code)).toEqual(["scripts/prepublish-only"]);
  });

  it("shouldRejectAUnitScriptThatRunsBrowserTests", async () => {
    const scripts = { ...COMPLIANT_SCRIPTS, test: "vitest run && playwright test" };
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(),
      manifest: { ...COMPLIANT_MANIFEST, scripts },
    });

    expect((await runRules(workspacePackage)).map(({ code }) => code)).toEqual(["scripts/browser-chain"]);
  });

  it("shouldRejectAUnitScriptThatDelegatesToTheBrowserScript", async () => {
    const scripts = { ...COMPLIANT_SCRIPTS, test: "vitest run && pnpm test:browser" };
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(),
      manifest: { ...COMPLIANT_MANIFEST, scripts },
    });

    expect((await runRules(workspacePackage)).map(({ code }) => code)).toEqual(["scripts/browser-chain"]);
  });

  it("shouldRequireABrowserScriptWhenAPlaywrightConfigExists", async () => {
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(["LICENSE", "playwright.config.ts"]),
    });

    expect((await runRules(workspacePackage)).map(({ code }) => code)).toEqual([
      "scripts/test-browser",
      "scripts/test-browser-watch",
    ]);
  });

  it("shouldAcceptAPackageThatSplitsItsBrowserSuiteOut", async () => {
    const scripts = {
      ...COMPLIANT_SCRIPTS,
      "test:browser": "playwright test",
      "test:browser:watch": "playwright test --ui",
    };
    const workspacePackage = createPackage({
      directory: await createPackageDirectory(["LICENSE", "playwright.config.ts"]),
      manifest: { ...COMPLIANT_MANIFEST, scripts },
    });

    await expect(runRules(workspacePackage)).resolves.toEqual([]);
  });

  it("shouldNotRequirePublishedMetadataFromPrivatePackages", async () => {
    const workspacePackage = createPackage({
      directory: await createPackageDirectory([]),
      isPrivate: true,
      manifest: { name: "@fixture/private" },
    });

    await expect(runRules(workspacePackage)).resolves.toEqual([]);
  });
});
