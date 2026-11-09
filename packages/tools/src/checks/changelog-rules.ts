import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { UnsupportedFrontmatterError, parseMarkdown } from "../documentation/document-policy.ts";
import { extractCuratedLinkTargets, stripMarkdownCode } from "../documentation/llms-full.ts";
import { parsePackageMetadata } from "../documentation/package-metadata.ts";
import { selectDocsVersions } from "../release/docs-versions.ts";
import { parseReleaseTag } from "../release/publish.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { CheckRule, Finding } from "./rule.ts";

const CHANGELOG_DIR = "docs/changelog";
const INDEX = `${CHANGELOG_DIR}/index.md`;
// `hub release --cut` scaffolds the description and bullet entries as TODOs,
// which tell a reader as little as no entry at all.
const PLACEHOLDER = /^TODO\b/iu;
const BODY_PLACEHOLDER = /^[ \t]*-\s+TODO\b/imu;
const REQUIRED_FIELDS = ["date", "description"] as const;
const REQUIRED_FIELD_HINTS: Record<(typeof REQUIRED_FIELDS)[number], string> = {
  date: "Set it to the release date in ISO YYYY-MM-DD form.",
  description: "Summarize the release in a sentence.",
};

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
  let body = contents;
  try {
    ({ body } = parseMarkdown(contents, INDEX));
  } catch (cause) {
    if (cause instanceof UnsupportedFrontmatterError) {
      ({ body } = cause);
    }
  }
  return extractCuratedLinkTargets(body).filter((name) => !name.includes("/") && name.endsWith(".md"));
}

/**
 * Reports the frontmatter and body a version page must carry and does not.
 *
 * Only presence is checked. The `documentation` rule already rejects a `date`
 * that is not ISO and a `description` that is empty.
 * @param packageRoot Absolute package directory.
 * @param page Version page file name, such as `1.2.0.md`.
 * @returns One finding per missing field or unfinished body placeholder.
 */
async function checkPageFrontmatter(packageRoot: string, page: string): Promise<Finding[]> {
  const location = `${CHANGELOG_DIR}/${page}`;
  const contents = await readFile(join(packageRoot, location), "utf8").catch(() => "");
  let body: string;
  let frontmatter: Record<string, unknown>;
  try {
    ({ body, frontmatter } = parseMarkdown(contents, location));
  } catch (cause) {
    if (!(cause instanceof UnsupportedFrontmatterError)) {
      throw cause;
    }
    // The documentation rule reports this page's frontmatter, because a changelog version page is a validation surface.
    return [];
  }
  const findings: Finding[] = REQUIRED_FIELDS.filter((field) => {
    const value = frontmatter[field];
    return typeof value !== "string" || value.trim() === "" || PLACEHOLDER.test(value);
  }).map((field) => ({
    code: `changelog/missing-${field}`,
    location,
    message: `Version page ${page} has no ${field} in its frontmatter. ${REQUIRED_FIELD_HINTS[field]} See docs/specs/packages-changelog.md.`,
    severity: "error",
  }));
  if (BODY_PLACEHOLDER.test(stripMarkdownCode(body))) {
    findings.push({
      code: "changelog/unfinished-entry",
      location,
      message: `Version page ${page} still has a scaffolded TODO entry. Replace every "- TODO:" bullet with prose; see docs/specs/packages-changelog.md.`,
      severity: "error",
    });
  }
  return findings;
}

/**
 * The earlier releases the documentation site keeps for a package, which make its changelog required.
 *
 * A kept version is one the maintainers declared still matters, through
 * `codenhub.docs.versions` or by the from-1.0 major rule
 * (`docs/specs/packages-docs-versions.md`), so its consumers need to read what
 * changed since. A malformed list is the `documentation` rule's to report.
 * @param workspacePackage Package to inspect.
 * @param tags Every local tag name.
 * @returns Archived versions, newest first.
 */
function keptEarlierReleases(workspacePackage: WorkspacePackage, tags: readonly string[]): string[] {
  let entries: string[] = [];
  try {
    entries = parsePackageMetadata(workspacePackage.manifest, "package.json")?.docsVersions ?? [];
  } catch {
    // Reported by the documentation rule; the major rule still applies.
  }
  const versions = tags.flatMap((tag) => {
    const release = parseReleaseTag(tag);
    return release?.name === workspacePackage.name ? [release.version] : [];
  });
  return selectDocsVersions(versions, entries).archived;
}

async function run(
  workspacePackage: WorkspacePackage,
  listTagsOnce: () => Promise<readonly string[]>,
): Promise<Finding[]> {
  if (!(await hasChangelog(workspacePackage))) {
    const kept = keptEarlierReleases(workspacePackage, await listTagsOnce());
    return kept.length === 0
      ? []
      : [
          {
            code: "changelog/required",
            location: INDEX,
            message: `The documentation site keeps ${kept.join(", ")} of this package, so it needs a changelog saying what changed since. Add docs/changelog/ as docs/specs/packages-changelog.md describes.`,
            severity: "error",
          },
        ];
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
  if (pages.includes(page)) {
    findings.push(...(await checkPageFrontmatter(workspacePackage.directory, page)));
  }
  return findings;
}

/**
 * Builds the rules that keep a changelog in step with the version.
 *
 * `docs/specs/packages-changelog.md` makes a changelog optional until the
 * documentation site keeps an earlier release of the package, and required from
 * then on. Once a package has one, the version in the manifest is the version a
 * consumer will install, so it is the one version that must be documented and published.
 * @param listTagsOnce Every local tag name, which says which earlier releases are kept.
 * @returns Rules in reporting order.
 */
export function createChangelogRules(listTagsOnce: () => Promise<readonly string[]> = async () => []): CheckRule[] {
  return [
    {
      appliesTo: ({ isPrivate }) => !isPrivate,
      name: "changelog",
      run: ({ package: workspacePackage }) => run(workspacePackage, listTagsOnce),
      summary:
        "A package that keeps an earlier release has a changelog, and a changelog documents, dates, describes, and links the version the manifest declares.",
    },
  ];
}
