import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import remarkParse from "remark-parse";
import { unified } from "unified";

import { resolveLocalPath } from "../documentation/document-graph.ts";
import { parsePackageMetadata, type PackageStatus } from "../documentation/package-metadata.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { isDocumentedPackage } from "../workspace/package-policy.ts";
import type { CheckRule, Finding } from "./rule.ts";

const README = "README.md";
const SECTION_HEADING = /^##\s/m;
const NOTICED_STATUSES: PackageStatus[] = ["deprecated", "experimental"];
const LICENSE = "LICENSE";
// The README spec allows small wording changes to a heading, such as
// "License and notices", as long as the section stays recognizable.
const LICENSE_HEADING = /^licen[cs]/i;

interface MarkdownNode {
  children?: MarkdownNode[];
  depth?: number;
  identifier?: string;
  type: string;
  url?: string;
  value?: string;
}

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

function textOf(node: MarkdownNode): string {
  return node.value ?? node.children?.map(textOf).join("") ?? "";
}

function visit(node: MarkdownNode, callback: (node: MarkdownNode) => void): void {
  callback(node);
  node.children?.forEach((child) => visit(child, callback));
}

/**
 * Reports whether the README `License` section links the package's `LICENSE` file.
 *
 * The README is parsed rather than scanned, so a link written in code is not
 * counted, a heading inside a code fence does not end the section, and a
 * reference link resolves through its definition wherever the README places it.
 * @param readme Authored README contents.
 * @returns True when a link in the section resolves to `LICENSE`.
 */
function linksLicense(readme: string): boolean {
  const tree = unified().use(remarkParse).parse(readme) as MarkdownNode;
  const definitions = new Map<string, string>();
  visit(tree, (node) => {
    if (node.type === "definition" && node.identifier !== undefined && node.url !== undefined) {
      definitions.set(node.identifier.toLowerCase(), node.url);
    }
  });
  const blocks = tree.children ?? [];
  const start = blocks.findIndex(
    (node) => node.type === "heading" && node.depth === 2 && LICENSE_HEADING.test(textOf(node).trim()),
  );
  if (start === -1) {
    return false;
  }
  const end = blocks.findIndex((node, index) => index > start && node.type === "heading" && (node.depth ?? 1) <= 2);
  const targets: string[] = [];
  for (const block of blocks.slice(start + 1, end === -1 ? undefined : end)) {
    visit(block, (node) => {
      if (node.type === "link" && node.url !== undefined) {
        targets.push(node.url);
      }
      const referenced = node.identifier === undefined ? undefined : definitions.get(node.identifier.toLowerCase());
      if (node.type === "linkReference" && referenced !== undefined) {
        targets.push(referenced);
      }
    });
  }
  return targets.some((target) => resolveLocalPath(README, target).path === LICENSE);
}

/**
 * Reports whether a package ships a `LICENSE` file. A private package ships
 * nothing, and npm leaves a symlink out of the tarball, so neither counts.
 */
async function shipsLicense(workspacePackage: WorkspacePackage): Promise<boolean> {
  if (workspacePackage.isPrivate) {
    return false;
  }
  try {
    return (await lstat(join(workspacePackage.directory, LICENSE))).isFile();
  } catch {
    return false;
  }
}

async function checkLicenseLink(workspacePackage: WorkspacePackage, readme: string): Promise<Finding[]> {
  if (!(await shipsLicense(workspacePackage)) || linksLicense(readme)) {
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
