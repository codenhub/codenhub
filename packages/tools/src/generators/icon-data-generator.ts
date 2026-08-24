import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import type { GeneratedFile, Generator } from "./generator.ts";
import { buildFamily } from "./icon-data/build-family.ts";
import { ICON_FAMILIES, type IconFamilyDefinition } from "./icon-data/family-definitions.ts";

const ICONS_PACKAGE = "@codenhub/icons";
const DATA_DIRECTORY = "data";
const NODE_MODULES = "node_modules";

async function readUpstreamVersion(packageDirectory: string): Promise<string> {
  const manifest = JSON.parse(await readFile(resolve(packageDirectory, "package.json"), "utf8")) as {
    version?: string;
  };
  if (!manifest.version) {
    throw new Error(`Upstream package at ${packageDirectory} declares no version.`);
  }
  return manifest.version;
}

async function locateUpstream(
  definition: IconFamilyDefinition,
  iconsPackage: WorkspacePackage,
  workspaceRoot: string,
): Promise<string> {
  const candidates = [
    resolve(iconsPackage.directory, NODE_MODULES, definition.upstreamPackage),
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
  throw new Error(
    `Icon family "${definition.prefix}" needs "${definition.upstreamPackage}", which is not installed for ${ICONS_PACKAGE}.`,
  );
}

/**
 * Creates the generator that rebuilds committed icon family data from the
 * upstream packages installed for `@codenhub/icons`.
 *
 * Artwork is content, not source: keeping it generated means an upstream bump
 * is one command and one reviewable diff, and the drift gate proves the
 * committed data matches the version the lockfile pins.
 *
 * @returns Generator ready for registration.
 */
export function createIconDataGenerator(): Generator {
  return {
    generate: async ({ packages, workspace }) => {
      const iconsPackage = packages.find(({ name }) => name === ICONS_PACKAGE);
      if (!iconsPackage) {
        return [];
      }

      const families = await Promise.all(
        ICON_FAMILIES.map(async (definition) => {
          const packageDirectory = await locateUpstream(definition, iconsPackage, workspace.root);
          const version = await readUpstreamVersion(packageDirectory);
          const { attributionText, document, licenseText } = await buildFamily(definition, packageDirectory, version);
          const familyDirectory = `${iconsPackage.location}/${DATA_DIRECTORY}/${definition.prefix}`;

          return [
            { contents: `${JSON.stringify(document, null, 2)}\n`, path: `${familyDirectory}/icons.json` },
            { contents: licenseText, path: `${familyDirectory}/LICENSE` },
            { contents: attributionText, path: `${familyDirectory}/ATTRIBUTION.md` },
          ] satisfies GeneratedFile[];
        }),
      );

      return families.flat();
    },
    name: "icon-data",
    summary: "Rebuild icon family data from the upstream packages it is generated from.",
  };
}
