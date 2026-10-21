/**
 * Rebuilds committed icon family data from the upstream packages installed
 * for this package.
 *
 * Artwork is content, not source: keeping it generated means an upstream bump
 * is one command and one reviewable diff, and the drift gate proves the
 * committed data matches the version the lockfile pins.
 *
 * Run as this package's own `generate` script, the way `hub generate` runs
 * any package that owns one. `--dry-run` reports drift without writing,
 * exiting non-zero when committed data is stale -- what the CI drift gate
 * checks.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { applyGenerated, findWorkspaceRoot, type GeneratedFile } from "@codenhub/tools/generators";

import { buildFamily } from "./icon-data/build-family.ts";
import { ICON_FAMILIES, type IconFamilyDefinition } from "./icon-data/family-definitions.ts";

const DATA_DIRECTORY = "data";
const NODE_MODULES = "node_modules";

const PINNED_COMMIT = /#(?<commit>[0-9a-f]{40})$/;

/**
 * Reads the commit a git-sourced family is pinned to, from this package's own
 * dependency on it: the installed repository carries no version, and the
 * commit is what the lockfile pins.
 */
async function readPinnedCommit(definition: IconFamilyDefinition, packageDirectory: string): Promise<string> {
  const manifest = JSON.parse(await readFile(resolve(packageDirectory, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  const specifier = manifest.devDependencies?.[definition.upstreamPackage] ?? "";
  const commit = PINNED_COMMIT.exec(specifier)?.groups?.commit;
  if (!commit) {
    throw new Error(
      `Icon family "${definition.prefix}" reads "${definition.upstreamRepository}", which must be pinned to a full commit hash, not "${specifier}".`,
    );
  }
  return commit;
}

async function readUpstreamVersion(
  definition: IconFamilyDefinition,
  upstreamDirectory: string,
  packageDirectory: string,
): Promise<string> {
  if (definition.upstreamRepository) {
    return readPinnedCommit(definition, packageDirectory);
  }
  const manifest = JSON.parse(await readFile(resolve(upstreamDirectory, "package.json"), "utf8")) as {
    version?: string;
  };
  if (!manifest.version) {
    throw new Error(`Upstream package at ${upstreamDirectory} declares no version.`);
  }
  return manifest.version;
}

async function locateUpstream(definition: IconFamilyDefinition, packageDirectory: string): Promise<string> {
  const workspaceRoot = await findWorkspaceRoot(packageDirectory);
  const candidates = [
    resolve(packageDirectory, NODE_MODULES, definition.upstreamPackage),
    resolve(workspaceRoot, NODE_MODULES, definition.upstreamPackage),
  ];
  const present = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await readFile(resolve(candidate, "package.json"), "utf8");
        return candidate;
      } catch {
        return undefined;
      }
    }),
  );
  const located = present.find((candidate) => candidate !== undefined);
  if (located) {
    return located;
  }
  throw new Error(`Icon family "${definition.prefix}" needs "${definition.upstreamPackage}", which is not installed.`);
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes("--dry-run");
  const packageDirectory = process.cwd();

  const families = await Promise.all(
    ICON_FAMILIES.map(async (definition) => {
      const upstreamDirectory = await locateUpstream(definition, packageDirectory);
      const version = await readUpstreamVersion(definition, upstreamDirectory, packageDirectory);
      const { attributionText, document, licenseText } = await buildFamily(definition, upstreamDirectory, version);
      const familyDirectory = `${DATA_DIRECTORY}/${definition.prefix}`;

      return [
        { contents: `${JSON.stringify(document, null, 2)}\n`, path: `${familyDirectory}/icons.json` },
        { contents: licenseText, path: `${familyDirectory}/LICENSE` },
        { contents: attributionText, path: `${familyDirectory}/ATTRIBUTION.md` },
      ] satisfies GeneratedFile[];
    }),
  );

  const outcomes = await applyGenerated(families.flat(), { dryRun: isDryRun, root: packageDirectory });
  const stale = outcomes.filter(({ hasDrift }) => hasDrift);

  if (isDryRun) {
    console.log(`${stale.length} of ${outcomes.length} generated file(s) are out of date.`);
    for (const { file } of stale) {
      console.log(`  ${file.path}`);
    }
    if (stale.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`${stale.length} of ${outcomes.length} generated file(s) written.`);
}

await main();
