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

/**
 * Runs every applicable manifest rule against one package.
 * @param workspacePackage Package under test.
 * @param siblings Other packages in the workspace, for the checks that compare one against the rest.
 * @returns Findings in reporting order.
 */
function runRules(workspacePackage: WorkspacePackage, siblings: readonly WorkspacePackage[] = []): Finding[] {
  return createManifestRules([workspacePackage, ...siblings])
    .filter((rule) => rule.appliesTo(workspacePackage))
    .flatMap((rule) => rule.run({ includePack: false, package: workspacePackage }) as Finding[]);
}

/** A private sibling that exists only to be depended on. */
function createSibling(name: string, workspaceDependencies: readonly string[] = []): WorkspacePackage {
  const unscopedName = name.slice(name.lastIndexOf("/") + 1);
  return createPackage({
    directory: `/repo/packages/${unscopedName}`,
    directoryName: unscopedName,
    isPrivate: true,
    location: `packages/${unscopedName}`,
    manifest: { name },
    name,
    unscopedName,
    workspaceDependencies,
  });
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
    const findings = runRules(createPackage({ manifest }), [createSibling("@fixture/other")]);

    expect(findings).toEqual([
      {
        code: "dependencies/workspace-range",
        location: "package.json",
        message: `"dependencies.@fixture/other" should use a "workspace:" range.`,
        severity: "warning",
      },
    ]);
  });

  it("shouldRequireACatalogRangeForADependencyTwoPackagesInstall", () => {
    const manifest = { ...COMPLIANT_MANIFEST, devDependencies: { vitest: "^4.0.0" }, scripts: COMPLIANT_SCRIPTS };
    const sibling = createSibling("@fixture/other");
    sibling.manifest = { ...sibling.manifest, devDependencies: { vitest: "catalog:" } };

    const findings = runRules(createPackage({ manifest }), [sibling]);

    expect(findings).toEqual([
      {
        code: "dependencies/catalog",
        location: "package.json",
        message: `"devDependencies.vitest" is installed by more than one package and must use "catalog:".`,
        severity: "error",
      },
    ]);
  });

  it("shouldAcceptAPinnedRangeForADependencyOnlyOnePackageInstalls", () => {
    const manifest = { ...COMPLIANT_MANIFEST, dependencies: { "left-pad": "1.3.0" }, scripts: COMPLIANT_SCRIPTS };

    expect(runRules(createPackage({ manifest }), [createSibling("@fixture/other")])).toEqual([]);
  });

  it("shouldNotRequireACatalogRangeForAPeerDependency", () => {
    const manifest = { ...COMPLIANT_MANIFEST, peerDependencies: { vite: ">=5.0.0" }, scripts: COMPLIANT_SCRIPTS };
    const sibling = createSibling("@fixture/other");
    sibling.manifest = { ...sibling.manifest, peerDependencies: { vite: ">=8.0.0" } };

    expect(runRules(createPackage({ manifest }), [sibling])).toEqual([]);
  });

  it("shouldReportADependencyCycleOnEveryPackageThatTakesPartInIt", () => {
    const workspacePackage = createPackage({ workspaceDependencies: ["@fixture/other"] });
    const sibling = createSibling("@fixture/other", ["@fixture/example"]);

    const findings = runRules(workspacePackage, [sibling]);

    expect(findings).toEqual([
      {
        code: "dependencies/cycle",
        location: "package.json",
        message: "Workspace dependency cycle: @fixture/example -> @fixture/other -> @fixture/example.",
        severity: "error",
      },
    ]);
    expect(runRules(sibling, [workspacePackage]).map(({ code }) => code)).toEqual(["dependencies/cycle"]);
  });

  it("shouldAcceptAnAcyclicDependencyChain", () => {
    const workspacePackage = createPackage({ workspaceDependencies: ["@fixture/other"] });

    expect(runRules(workspacePackage, [createSibling("@fixture/other")])).toEqual([]);
  });

  it("shouldNotRequirePublishedMetadataFromPrivatePackages", () => {
    expect(runRules(createPackage({ isPrivate: true, manifest: { name: "@fixture/private" } }))).toEqual([]);
  });
});
