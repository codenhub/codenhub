import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createEnginesRules } from "./engines-rules.ts";
import type { Finding } from "./rule.ts";

const COMPLIANT_README = "# Example\n\n## Requirements\n\n- Node.js 24 or newer.\n";

/**
 * Creates a repository root holding a `.nvmrc` and one package with the given files.
 * @param files Package-relative paths mapped to their contents.
 * @param pin Contents of the root `.nvmrc`, or `undefined` to leave it out.
 * @returns Absolute root and package directories.
 */
async function createFixture(
  files: Readonly<Record<string, string>> = { "README.md": COMPLIANT_README },
  pin: string | undefined = "24.14.1\n",
): Promise<{ root: string; directory: string }> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-engines-"));
  const directory = join(root, "packages", "example");
  await mkdir(directory, { recursive: true });
  if (pin !== undefined) {
    await writeFile(join(root, ".nvmrc"), pin);
  }
  await Promise.all(
    Object.entries(files).map(async ([file, contents]) => {
      await mkdir(dirname(join(directory, file)), { recursive: true });
      await writeFile(join(directory, file), contents);
    }),
  );
  return { directory, root };
}

function createPackage(directory: string, engines: unknown = { node: ">=24" }, isPrivate = false): WorkspacePackage {
  return {
    directory,
    directoryName: "example",
    isPrivate,
    location: "packages/example",
    manifest: { engines, name: "@fixture/example", private: isPrivate },
    name: "@fixture/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

async function runRules(workspacePackage: WorkspacePackage, root: string): Promise<Finding[]> {
  const applicable = createEnginesRules(root).filter((rule) => rule.appliesTo(workspacePackage));
  const findings = await Promise.all(
    applicable.map(async (rule) => rule.run({ includePack: false, package: workspacePackage })),
  );
  return findings.flat();
}

async function codes(engines: unknown, files?: Readonly<Record<string, string>>, pin?: string): Promise<string[]> {
  const { directory, root } = await createFixture(files, pin);
  return (await runRules(createPackage(directory, engines), root)).map(({ code }) => code);
}

describe("engines rules", () => {
  it("shouldAcceptThePinnedMajorStatedInTheReadmeAndDocs", async () => {
    const files = {
      "README.md": COMPLIANT_README,
      "docs/index.md": "| Node.js | 24 or newer, for the build-time plugins. |\n",
    };

    await expect(codes({ node: ">=24" }, files)).resolves.toEqual([]);
  });

  it("shouldSkipPackagesThatDeclareNoNodeFloor", async () => {
    const { directory, root } = await createFixture();

    await expect(runRules(createPackage(directory, undefined), root)).resolves.toEqual([]);
    await expect(runRules(createPackage(directory, { pnpm: ">=11" }), root)).resolves.toEqual([]);
  });

  it("shouldSkipPrivatePackages", async () => {
    const { directory, root } = await createFixture();

    await expect(runRules(createPackage(directory, { node: ">=22" }, true), root)).resolves.toEqual([]);
  });

  it("shouldReportAFloorBelowThePinnedMajor", async () => {
    const files = { "README.md": "- Node.js 22 or newer.\n" };

    await expect(codes({ node: ">=22" }, files)).resolves.toEqual(["engines/node-below-pin"]);
  });

  it("shouldReportAFloorAboveThePinnedVersion", async () => {
    await expect(codes({ node: ">=24.20" }, { "README.md": "- Node.js 24.20 or newer.\n" })).resolves.toEqual([
      "engines/node-above-pin",
    ]);
    await expect(codes({ node: ">=26" }, { "README.md": "- Node.js 26 or newer.\n" })).resolves.toEqual([
      "engines/node-above-pin",
    ]);
  });

  it("shouldAcceptAHigherFloorWithinThePinnedVersion", async () => {
    const files = { "README.md": "- Node.js 24.14.1 or newer, for an API 24.0 lacks.\n" };

    await expect(codes({ node: ">=24.14.1" }, files)).resolves.toEqual([]);
  });

  it("shouldReportARangeThatIsNotALowerBoundOnly", async () => {
    await expect(codes({ node: ">=24 <25" })).resolves.toEqual(["engines/node-range"]);
    await expect(codes({ node: "^24" })).resolves.toEqual(["engines/node-range"]);
    await expect(codes({ node: 24 })).resolves.toEqual(["engines/node-range"]);
  });

  it("shouldReportAnUnreadablePin", async () => {
    await expect(codes({ node: ">=24" }, undefined, "lts/*\n")).resolves.toEqual(["engines/pin"]);
  });

  it("shouldReportAReadmeThatDoesNotStateTheFloor", async () => {
    await expect(codes({ node: ">=24" }, { "README.md": "# Example\n" })).resolves.toEqual(["engines/readme"]);
  });

  it("shouldReportAReadmeOrPublicDocThatStatesAnotherFloor", async () => {
    const files = {
      "README.md": "- Node.js 22 or newer.\n",
      "docs/cli.md": "Node.js 22 or newer is required.\n",
      "docs/guide/setup.md": "Requires Node.js 24 or newer.\n",
    };
    const { directory, root } = await createFixture(files);
    const findings = await runRules(createPackage(directory), root);

    expect(findings.map(({ code, location }) => [code, location])).toEqual([
      ["engines/readme", "README.md"],
      ["engines/docs", "docs/cli.md"],
    ]);
  });

  it("shouldIgnoreInternalDocsAndChangelogPages", async () => {
    const files = {
      "README.md": COMPLIANT_README,
      "docs/changelog/0.1.0.md": "- An `engines` field requiring Node.js 22 or newer.\n",
      "docs/internal/notes.md": "Tested on Node.js 22 or newer.\n",
    };

    await expect(codes({ node: ">=24" }, files)).resolves.toEqual([]);
  });
});
