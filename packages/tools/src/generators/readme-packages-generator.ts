import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { replaceGeneratedRegion, type Generator } from "./generator.ts";

const REGION = "packages";
const README = "README.md";

const GROUPS = [
  { heading: "Applications", matches: (location: string) => location.startsWith("apps/") },
  { heading: "Libraries & Primitives", matches: () => true },
] as const;

const PLUGINS_PREFIX = "packages/plugins/";

function isNested(workspacePackage: WorkspacePackage, packages: readonly WorkspacePackage[]): boolean {
  return packages.some(
    (other) => other !== workspacePackage && workspacePackage.location.startsWith(`${other.location}/`),
  );
}

function getHeading(workspacePackage: WorkspacePackage): string {
  if (workspacePackage.location.startsWith(PLUGINS_PREFIX)) {
    return "Plugins";
  }
  if (workspacePackage.isPrivate && workspacePackage.location.startsWith("packages/")) {
    return "Tooling";
  }
  return GROUPS.find(({ matches }) => matches(workspacePackage.location))!.heading;
}

function describe(workspacePackage: WorkspacePackage): string {
  const description = workspacePackage.manifest.description;
  const text = typeof description === "string" && description.trim() !== "" ? description : "";
  return text === "" ? `- \`${workspacePackage.location}\`` : `- \`${workspacePackage.location}\`: ${text}`;
}

function renderList(packages: readonly WorkspacePackage[]): string {
  const listed = packages
    .filter((workspacePackage) => !isNested(workspacePackage, packages))
    .toSorted((first, second) => first.location.localeCompare(second.location));
  const headings = ["Applications", "Libraries & Primitives", "Tooling", "Plugins"];

  return headings
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
