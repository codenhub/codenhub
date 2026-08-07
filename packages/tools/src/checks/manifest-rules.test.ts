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

function runRules(workspacePackage: WorkspacePackage, workspaceNames = new Set<string>()): Finding[] {
  return createManifestRules(workspaceNames)
    .filter((rule) => rule.appliesTo(workspacePackage))
    .flatMap((rule) => rule.run({ includePack: false, package: workspacePackage }) as Finding[]);
}

describe("manifest rules", () => {
  it("shouldAcceptACompliantPublishedPackage", () => {
    expect(runRules(createPackage())).toEqual([]);
  });

  it("shouldReportEveryMissingRequiredMetadataField", () => {
    const workspacePackage = createPackage({
      manifest: { name: "@fixture/example", scripts: COMPLIANT_SCRIPTS },
    });

    expect(runRules(workspacePackage).map(({ code }) => code)).toEqual([
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

  it("shouldTreatRecommendedFieldsAsWarnings", () => {
    const manifest = { ...COMPLIANT_MANIFEST, scripts: COMPLIANT_SCRIPTS, license: undefined };
    const findings = runRules(createPackage({ manifest }));

    expect(findings).toEqual([
      { code: "metadata/license", location: "package.json", message: `Should declare "license".`, severity: "warning" },
    ]);
  });

  it("shouldRequirePrivateToBeDeclaredAsFalse", () => {
    const manifest = { ...COMPLIANT_MANIFEST, private: undefined, scripts: COMPLIANT_SCRIPTS };

    expect(runRules(createPackage({ manifest })).map(({ code }) => code)).toEqual(["metadata/private"]);
  });

  it("shouldRequireACoverageScript", () => {
    const scripts = { ...COMPLIANT_SCRIPTS, "test:coverage": undefined };
    const findings = runRules(createPackage({ manifest: { ...COMPLIANT_MANIFEST, scripts } }));

    expect(findings.map(({ code }) => code)).toEqual(["scripts/test:coverage"]);
  });

  it("shouldRejectAScriptThatChainsABuild", () => {
    const scripts = { ...COMPLIANT_SCRIPTS, test: "pnpm build && vitest run" };
    const findings = runRules(createPackage({ manifest: { ...COMPLIANT_MANIFEST, scripts } }));

    expect(findings.map(({ code }) => code)).toEqual(["scripts/build-chain"]);
  });

  it("shouldCheckTheBuildChainRuleForPrivatePackagesToo", () => {
    const scripts = { typecheck: "pnpm run build && tsc --noEmit" };
    const findings = runRules(createPackage({ isPrivate: true, manifest: { name: "@fixture/private", scripts } }));

    expect(findings.map(({ code }) => code)).toEqual(["scripts/build-chain"]);
  });

  it("shouldNotReadANamespacedBuildScriptAsAChainedBuild", () => {
    const scripts = { ...COMPLIANT_SCRIPTS, test: "pnpm build:fixtures && vitest run" };

    expect(runRules(createPackage({ manifest: { ...COMPLIANT_MANIFEST, scripts } }))).toEqual([]);
  });

  it("shouldRequirePrepublishOnlyToStaySelfContained", () => {
    const scripts = { ...COMPLIANT_SCRIPTS, prepublishOnly: "pnpm typecheck" };
    const findings = runRules(createPackage({ manifest: { ...COMPLIANT_MANIFEST, scripts } }));

    expect(findings.map(({ code }) => code)).toEqual(["scripts/prepublish-only"]);
  });

  it("shouldReportInternalDependenciesWithoutAWorkspaceRange", () => {
    const manifest = {
      ...COMPLIANT_MANIFEST,
      dependencies: { "@fixture/other": "^1.0.0" },
      peerDependencies: { "@fixture/other": ">=1" },
      scripts: COMPLIANT_SCRIPTS,
    };
    const findings = runRules(createPackage({ manifest }), new Set(["@fixture/other"]));

    expect(findings).toEqual([
      {
        code: "dependencies/workspace-range",
        location: "package.json",
        message: `"dependencies.@fixture/other" should use a "workspace:" range.`,
        severity: "warning",
      },
    ]);
  });

  it("shouldNotRequirePublishedMetadataFromPrivatePackages", () => {
    expect(runRules(createPackage({ isPrivate: true, manifest: { name: "@fixture/private" } }))).toEqual([]);
  });
});
