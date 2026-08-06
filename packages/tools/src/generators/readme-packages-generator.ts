import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { replaceGeneratedRegion, type Generator } from "./generator.ts";

const REGION = "packages";
const README = "README.md";

const APPS_PREFIX = "apps/";
const PACKAGES_PREFIX = "packages/";
const PLUGINS_PREFIX = "packages/plugins/";

function isLibraryLocation({ location }: WorkspacePackage): boolean {
  return location.startsWith(PACKAGES_PREFIX) && !location.startsWith(PLUGINS_PREFIX);
}

// Ordered as the README renders them. The predicates are mutually exclusive, so
// one list decides both which section a package belongs to and where it appears.
const GROUPS = [
  { heading: "Applications", matches: ({ location }: WorkspacePackage) => location.startsWith(APPS_PREFIX) },
  {
    heading: "Libraries & Primitives",
    matches: (workspacePackage: WorkspacePackage) =>
      isLibraryLocation(workspacePackage) && !workspacePackage.isPrivate,
  },
  {
    heading: "Tooling",
    matches: (workspacePackage: WorkspacePackage) => isLibraryLocation(workspacePackage) && workspacePackage.isPrivate,
  },
  { heading: "Plugins", matches: ({ location }: WorkspacePackage) => location.startsWith(PLUGINS_PREFIX) },
] as const;

// A package outside the known locations still belongs in the list rather than
// being dropped from it silently.
const FALLBACK_HEADING = "Libraries & Primitives";

function isNested(workspacePackage: WorkspacePackage, packages: readonly WorkspacePackage[]): boolean {
  return packages.some(
    (other) => other !== workspacePackage && workspacePackage.location.startsWith(`${other.location}/`),
  );
}

function getHeading(workspacePackage: WorkspacePackage): string {
  return GROUPS.find(({ matches }) => matches(workspacePackage))?.heading ?? FALLBACK_HEADING;
}

function describe(workspacePackage: WorkspacePackage): string {
  const description = workspacePackage.manifest.description;
  const entry = `- \`${workspacePackage.location}\``;
  return typeof description === "string" && description.trim() !== "" ? `${entry}: ${description}` : entry;
}

function renderList(packages: readonly WorkspacePackage[]): string {
  const listed = packages
    .filter((workspacePackage) => !isNested(workspacePackage, packages))
    .toSorted((first, second) => first.location.localeCompare(second.location));

  return GROUPS.map(({ heading }) => heading)
    .flatMap((heading) => {
      const members = listed.filter((workspacePackage) => getHeading(workspacePackage) === heading);
      return members.length === 0 ? [] : [`### ${heading}`, "", ...members.map(describe), ""];
    })
    .join("\n")
    .trimEnd();
}

/**
 * Creates the generator that keeps the root README package list current.
 *
 * Package descriptions come from manifests so the list cannot drift from what
 * each package says about itself.
 * @returns Generator ready for registration.
 */
export function createReadmePackagesGenerator(): Generator {
  return {
    generate: async ({ isWholeWorkspace, workspace }) => {
      if (!isWholeWorkspace) {
        return [];
      }
      const source = await readFile(resolve(workspace.root, README), "utf8");
      return [{ contents: replaceGeneratedRegion(source, REGION, renderList(workspace.packages)), path: README }];
    },
    name: "readme-packages",
    summary: "Rewrite the root README package list from workspace manifests.",
  };
}
