import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parsePackageMetadata, type PackageStatus } from "../documentation/package-metadata.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { isDocumentedPackage } from "../workspace/package-policy.ts";
import type { CheckRule, Finding } from "./rule.ts";

const README = "README.md";
const SECTION_HEADING = /^##\s/m;
const NOTICED_STATUSES: PackageStatus[] = ["deprecated", "experimental"];

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

async function checkReadmeStatus(workspacePackage: WorkspacePackage): Promise<Finding[]> {
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

  const readme = await readFile(join(workspacePackage.directory, README), "utf8").catch(() => undefined);
  if (readme === undefined) {
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
          message: `"codenhub.docs.status" is "${status}", so the README must state it above the first section.`,
          severity: "error",
        },
      ];
    }
    if (noticedStatus !== status && isMentioned) {
      return [
        {
          code: "readme/conflicting-status-notice",
          location: README,
          message: `The README opens with a "${noticedStatus}" notice while "codenhub.docs.status" is "${status}".`,
          severity: "error",
        },
      ];
    }
    return [];
  });
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
      run: ({ package: workspacePackage }) => checkReadmeStatus(workspacePackage),
      summary: "README status notices agree with the declared documentation status.",
    },
  ];
}
