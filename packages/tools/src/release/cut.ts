import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { compareVersions } from "./readiness.ts";

const CHANGELOG_DIR = "docs/changelog";
const INDEX = `${CHANGELOG_DIR}/index.md`;
const MANIFEST = "package.json";
const VERSION_FIELD = /(?<prefix>"version"\s*:\s*")(?<version>[^"]*)(?<suffix>")/u;
const LINK_LINE = /^-\s+\[(?<label>[^\]]+)\]\((?<target>[^)]+)\)\s*$/u;

/** How a version may be raised. */
export type VersionBump = "major" | "minor" | "patch";

const BUMPS: readonly VersionBump[] = ["major", "minor", "patch"];

/**
 * Whether a string names a bump rather than a version.
 * @param value Value as typed.
 * @returns True when it is `major`, `minor`, or `patch`.
 */
export function isVersionBump(value: string): value is VersionBump {
  return (BUMPS as readonly string[]).includes(value);
}

/**
 * Raises a semantic version by one release step.
 *
 * Only the release parts move. A pre-release identifier on the current version
 * is dropped, because the next `major`, `minor`, or `patch` after `1.0.0-beta.1`
 * is a release rather than another pre-release.
 * @param current Version to raise, such as `0.3.0`.
 * @param bump Which part to raise.
 * @returns The raised version.
 * @throws When the current version has no readable release parts.
 */
export function applyBump(current: string, bump: VersionBump): string {
  const [core = ""] = current.split("+");
  const [release = ""] = core.split("-");
  const parts = release.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Cannot bump "${current}": expected a major.minor.patch version.`);
  }
  const [major = 0, minor = 0, patch = 0] = parts;
  if (bump === "major") {
    return `${major + 1}.0.0`;
  }
  return bump === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/**
 * Resolves what `--cut` was asked for into the version it should write.
 * @param current Version currently in the manifest.
 * @param requested A bump name, or an explicit version.
 * @returns The version to write.
 * @throws When the request is unusable or would not move the version forward.
 */
export function resolveNextVersion(current: string, requested: string): string {
  const next = isVersionBump(requested) ? applyBump(current, requested) : requested;
  if (compareVersions(next, current) <= 0) {
    throw new Error(`${next} does not come after the current ${current}.`);
  }
  return next;
}

/**
 * Rewrites the `version` field of a manifest, leaving everything else byte-identical.
 *
 * A parse-and-stringify round trip would reformat a file `oxfmt` owns and lose
 * its key order, so the field is replaced in place instead.
 * @param contents Manifest as written.
 * @param version Version to write.
 * @returns The manifest with its version replaced.
 * @throws When the manifest carries no `version` field to replace.
 */
export function replaceManifestVersion(contents: string, version: string): string {
  if (!VERSION_FIELD.test(contents)) {
    throw new Error(`No "version" field to replace in ${MANIFEST}.`);
  }
  return contents.replace(VERSION_FIELD, `$<prefix>${version}$<suffix>`);
}

/**
 * Builds a changelog page for a version, with the headings and nothing else.
 *
 * The bullets are deliberately absent. What changed for a consumer is the one
 * part of a release no tool can derive, so the page is scaffolded to be
 * finished rather than generated to look complete.
 * @param version Version the page documents.
 * @param date Release date in ISO `YYYY-MM-DD` form.
 * @returns The page contents.
 */
export function buildChangelogPage(version: string, date: string): string {
  return `---
title: ${version}
date: ${date}
---

# ${version}

## Added

- TODO: what a consumer can now do that they could not before.

## Changed

- TODO: what behaves differently, and what an upgrader has to do about it.

## Fixed

- TODO: what was broken.
`;
}

/**
 * Adds a version's link to a changelog index, newest first.
 *
 * The index is an ordered list of links and nothing else, so the new link goes
 * above the first existing one. An index that already links the version is
 * returned untouched.
 * @param contents Index as written.
 * @param version Version to link.
 * @returns The index with the link inserted.
 */
export function insertChangelogLink(contents: string, version: string): string {
  const link = `- [${version}](${version}.md)`;
  const lines = contents.split(/\r?\n/);
  if (lines.some((line) => LINK_LINE.exec(line)?.groups?.target === `${version}.md`)) {
    return contents;
  }
  const first = lines.findIndex((line) => LINK_LINE.test(line));
  if (first === -1) {
    // No list yet: the index is the H1 and whatever follows it, so the list
    // starts after the last non-empty line.
    const end = lines.findLastIndex((line) => line.trim() !== "");
    lines.splice(end + 1, 0, "", link);
    return lines.join("\n");
  }
  lines.splice(first, 0, link);
  return lines.join("\n");
}

/**
 * Builds a changelog index for a package that has none yet.
 * @param version Version the index should link.
 * @returns The index contents.
 */
export function buildChangelogIndex(version: string): string {
  return `---
title: Changelog
curated: true
group: Changelog
---

# Changelog

- [${version}](${version}.md)
`;
}

/** What a cut wrote, in the order it wrote it. */
export interface CutResult {
  /** Version the manifest now declares. */
  version: string;
  /** Package-relative POSIX paths that were created or rewritten. */
  written: string[];
  /** Release tag that would authorize publishing this version. */
  tag: string;
}

/**
 * Raises a package's version and scaffolds the changelog entry that documents it.
 *
 * Nothing is committed and nothing is tagged. The scaffolded page carries
 * headings and TODO bullets, so committing it unread would publish a changelog
 * that says nothing — leaving the working tree dirty is what forces the one part
 * of a release a person has to write.
 * @param workspacePackage Package to cut.
 * @param requested A bump name, or an explicit version.
 * @param today Release date in ISO `YYYY-MM-DD` form.
 * @returns What was written and the tag that would publish it.
 * @throws When the version request is unusable or the manifest cannot be rewritten.
 */
export async function cutRelease(
  workspacePackage: WorkspacePackage,
  requested: string,
  today: string,
): Promise<CutResult> {
  const current = workspacePackage.manifest.version;
  if (typeof current !== "string") {
    throw new Error(`${workspacePackage.name} has no "version" in its manifest.`);
  }
  const version = resolveNextVersion(current, requested);
  const written: string[] = [];

  const manifestPath = join(workspacePackage.directory, MANIFEST);
  const manifest = await readFile(manifestPath, "utf8");
  await writeFile(manifestPath, replaceManifestVersion(manifest, version));
  written.push(MANIFEST);

  const changelogRoot = join(workspacePackage.directory, CHANGELOG_DIR);
  await mkdir(changelogRoot, { recursive: true });
  const existing = await readdir(changelogRoot).catch(() => [] as string[]);

  const pagePath = join(changelogRoot, `${version}.md`);
  if (!existing.includes(`${version}.md`)) {
    await writeFile(pagePath, buildChangelogPage(version, today));
    written.push(`${CHANGELOG_DIR}/${version}.md`);
  }

  const indexPath = join(workspacePackage.directory, INDEX);
  const index = await readFile(indexPath, "utf8").catch(() => undefined);
  await writeFile(indexPath, index === undefined ? buildChangelogIndex(version) : insertChangelogLink(index, version));
  written.push(INDEX);

  return { tag: `${workspacePackage.name}@${version}`, version, written };
}
