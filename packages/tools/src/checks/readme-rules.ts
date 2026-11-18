import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { parsePackageMetadata, type PackageStatus } from "../documentation/package-metadata.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { isDocumentedPackage } from "../workspace/package-policy.ts";
import type { CheckRule, Finding } from "./rule.ts";

const README = "README.md";
const SECTION_HEADING = /^##\s/m;
const NOTICED_STATUSES: PackageStatus[] = ["deprecated", "experimental"];
const LICENSE = "LICENSE";
const LICENSE_HEADING = /^##[ \t]+License[ \t]*\r?$/im;
const INLINE_LINK_TARGET = /\]\(\s*<?([^)\s>]+)/g;
const REFERENCE_LINK_TARGET = /^[ \t]*\[[^\]]+\]:[ \t]*<?([^\s>]+)/gm;

/**
 * Extracts the status notices a reader sees before the first README section.
 *
 * Only blockquote lines count. Matching the whole intro would flag any prose
 * that happens to contain "experimental", while every notice this spec asks for
 * is an admonition placed above the first section heading.
 * @param readme Authored README contents.
 * @returns Lowercased notice text, empty when the intro has no blockquote.
 */
function readStatusNotices(readme: string): string {
  const intro = readme.split(SECTION_HEADING, 1)[0] ?? "";
  return intro
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith(">"))
    .join("\n")
    .toLowerCase();
}

function checkReadmeStatus(workspacePackage: WorkspacePackage, readme: string): Finding[] {
  let status: PackageStatus;
  try {
    // A malformed manifest is already reported by the documentation rule.
    const metadata = parsePackageMetadata(workspacePackage.manifest, `${workspacePackage.location}/package.json`);
    if (metadata === null) {
      return [];
    }
    status = metadata.status;
  } catch {
    return [];
  }

  const notices = readStatusNotices(readme);
  return NOTICED_STATUSES.flatMap((noticedStatus): Finding[] => {
    const isMentioned = notices.includes(noticedStatus);
    if (noticedStatus === status && !isMentioned) {
      return [
        {
          code: "readme/missing-status-notice",
          location: README,
          message: `"codenhub.status" is "${status}", so the README must state it above the first section.`,
          severity: "error",
        },
      ];
    }
    if (noticedStatus !== status && isMentioned) {
      return [
        {
          code: "readme/conflicting-status-notice",
          location: README,
          message: `The README opens with a "${noticedStatus}" notice while "codenhub.status" is "${status}".`,
          severity: "error",
        },
      ];
    }
    return [];
  });
}

/**
 * Reads the `License` section of a README, up to the next section heading.
 * @param readme Authored README contents.
 * @returns The section body, or `undefined` when the README has no `License` section.
 */
function readLicenseSection(readme: string): string | undefined {
  const heading = LICENSE_HEADING.exec(readme);
  if (heading === null) {
    return undefined;
  }
  const rest = readme.slice(heading.index + heading[0].length);
  return rest.split(SECTION_HEADING, 1)[0];
}

function linksLicense(section: string): boolean {
  const targets = [...section.matchAll(INLINE_LINK_TARGET), ...section.matchAll(REFERENCE_LINK_TARGET)].map(
    (match) => match[1] ?? "",
  );
  return targets.some((target) => target.split("#", 1)[0]?.replace(/^\.\//, "") === LICENSE);
}

async function shipsLicense(workspacePackage: WorkspacePackage): Promise<boolean> {
  try {
    return (await stat(join(workspacePackage.directory, LICENSE))).isFile();
  } catch {
    return false;
  }
}

async function checkLicenseLink(workspacePackage: WorkspacePackage, readme: string): Promise<Finding[]> {
  const section = readLicenseSection(readme);
  if ((section !== undefined && linksLicense(section)) || !(await shipsLicense(workspacePackage))) {
    return [];
  }
  return [
    {
      code: "readme/license-link",
      location: README,
      message: "The package ships a LICENSE file, so the README License section should link it.",
      severity: "warning",
    },
  ];
}

async function checkReadme(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  const readme = await readFile(join(workspacePackage.directory, README), "utf8").catch(() => undefined);
  if (readme === undefined) {
    return [];
  }
  return [...checkReadmeStatus(workspacePackage, readme), ...(await checkLicenseLink(workspacePackage, readme))];
}

/**
 * Creates the rules that check README content against the README spec.
 * @returns README rules ready for registration.
 */
export function createReadmeRules(): CheckRule[] {
  return [
    {
      appliesTo: isDocumentedPackage,
      name: "readme",
      run: ({ package: workspacePackage }) => checkReadme(workspacePackage),
      summary: "README status notices agree with the declared status, and the License section links a shipped LICENSE.",
    },
  ];
}
