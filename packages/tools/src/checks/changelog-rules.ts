import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import type { CheckRule, Finding } from "./rule.ts";

const CHANGELOG_DIR = "docs/changelog";
const INDEX = `${CHANGELOG_DIR}/index.md`;
const LINK_PATTERN = /\]\(\s*(?<target>[^)\s]+)/gu;

/**
 * Whether a package keeps a changelog.
 *
 * `docs/specs/packages-changelog.md` makes one recommended rather than required,
 * and the directory is the opt-in — there is no metadata flag. A package without
 * one is compliant and this rule has nothing to say about it.
 * @param workspacePackage Package to inspect.
 * @returns True when the package has a `docs/changelog/` directory.
 */
async function hasChangelog(workspacePackage: WorkspacePackage): Promise<boolean> {
  const entries = await readdir(join(workspacePackage.directory, CHANGELOG_DIR)).catch(() => undefined);
  return entries !== undefined;
}

/**
 * Reads the version pages `index.md` links, in the order it links them.
 * @param packageRoot Absolute package directory.
 * @returns Linked file names such as `1.2.0.md`, or `undefined` when the index is unreadable.
 */
async function readLinkedPages(packageRoot: string): Promise<string[] | undefined> {
  const contents = await readFile(join(packageRoot, INDEX), "utf8").catch(() => undefined);
  if (contents === undefined) {
    return undefined;
  }
  return [...contents.matchAll(LINK_PATTERN)]
    .map((match) => match.groups?.target ?? "")
    .map((target) => target.split("/").at(-1) ?? "")
    .filter((name) => name.endsWith(".md"));
}

async function run(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  if (!(await hasChangelog(workspacePackage))) {
    return [];
  }
  const version = workspacePackage.manifest.version;
  if (typeof version !== "string") {
    return [];
  }

  const page = `${version}.md`;
  const linked = await readLinkedPages(workspacePackage.directory);
  if (linked === undefined) {
    return [
      {
        code: "changelog/missing-index",
        location: INDEX,
        message: `docs/changelog/ exists without an index.md. It is what publishes the version pages; see docs/specs/packages-changelog.md.`,
        severity: "error",
      },
    ];
  }

  const findings: Finding[] = [];
  const pages = await readdir(join(workspacePackage.directory, CHANGELOG_DIR)).catch(() => [] as string[]);
  if (!pages.includes(page)) {
    findings.push({
      code: "changelog/missing-entry",
      location: `${CHANGELOG_DIR}/${page}`,
      message: `Version ${version} has no changelog page. A released version a consumer cannot read about is the drift a changelog exists to prevent; run \`pnpm hub release --cut\` or write the page.`,
      severity: "error",
    });
  } else if (!linked.includes(page)) {
    // A version page that exists but is unlinked gets no route, no navigation
    // entry, and no search result. The spec permits dropping an old version's
    // link deliberately; dropping the current one is never deliberate.
    findings.push({
      code: "changelog/unlinked-entry",
      location: INDEX,
      message: `Version ${version} has a page that index.md does not link, so the documentation site will not publish it.`,
      severity: "error",
    });
  }
  return findings;
}

/**
 * Builds the rules that keep an opted-in changelog in step with the version.
 *
 * The rules apply only to a package that already has `docs/changelog/`, because
 * `docs/specs/packages-changelog.md` makes keeping one recommended rather than
 * required. What they enforce is the part that is not optional once a package
 * has opted in: the version in the manifest is the version a consumer will
 * install, so it is the one version that must be documented and published.
 * @returns Rules in reporting order.
 */
export function createChangelogRules(): CheckRule[] {
  return [
    {
      appliesTo: ({ isPrivate }) => !isPrivate,
      name: "changelog",
      run: ({ package: workspacePackage }) => run(workspacePackage),
      summary: "An opted-in changelog documents and links the version the manifest declares.",
    },
  ];
}
