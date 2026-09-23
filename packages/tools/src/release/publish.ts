import { execute } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { ReadinessCheck } from "./readiness.ts";

/** A release tag split into the package it names and the version it releases. */
export interface ReleaseTag {
  /** Package name, such as `@codenhub/error`. */
  name: string;
  /** Version the tag releases, such as `0.3.0`. */
  version: string;
}

/**
 * Splits a release tag into the package name and version it carries.
 *
 * The format is `<package name>@<version>`, so a scoped name keeps its own
 * leading `@` and the separator is the last one rather than the first.
 * @param tag Tag as written, such as `@codenhub/error@0.3.0`.
 * @returns The package and version the tag names, or `undefined` when it is not a release tag.
 */
export function parseReleaseTag(tag: string): ReleaseTag | undefined {
  const separator = tag.lastIndexOf("@");
  if (separator <= 0) {
    return undefined;
  }
  const [name, version] = [tag.slice(0, separator), tag.slice(separator + 1)];
  return name === "" || version === "" ? undefined : { name, version };
}

/** Why a package cannot be published from a given tag. */
export type TagResolutionError =
  | { reason: "malformed"; detail: string }
  | { reason: "unknown-package"; detail: string }
  | { reason: "private"; detail: string }
  | { reason: "version-mismatch"; detail: string };

/**
 * Resolves a release tag to the workspace package it publishes.
 *
 * The version in the tag must equal the version in the manifest at the commit
 * the tag points at. That equality is the whole point of tag-triggered
 * publishing: the tag is what a maintainer authorizes, and the manifest is what
 * the registry records, so a run where they disagree is a run publishing
 * something nobody asked for.
 * @param tag Tag as written, such as `@codenhub/error@0.3.0`.
 * @param packages Discovered workspace packages.
 * @returns The package to publish, or why the tag does not name one.
 */
export function resolveTagTarget(
  tag: string,
  packages: readonly WorkspacePackage[],
): { package: WorkspacePackage } | TagResolutionError {
  const parsed = parseReleaseTag(tag);
  if (parsed === undefined) {
    return { detail: `"${tag}" is not a release tag; expected "<package name>@<version>"`, reason: "malformed" };
  }
  const found = packages.find(({ name }) => name === parsed.name);
  if (found === undefined) {
    return { detail: `no workspace package is named "${parsed.name}"`, reason: "unknown-package" };
  }
  if (found.isPrivate) {
    return { detail: `${found.name} is private and is never published`, reason: "private" };
  }
  const declared = found.manifest.version;
  if (declared !== parsed.version) {
    return {
      detail: `${found.name} declares ${String(declared)} but the tag releases ${parsed.version}`,
      reason: "version-mismatch",
    };
  }
  return { package: found };
}

/**
 * The npm dist-tag a version publishes under.
 *
 * `npm publish` moves `latest` to whatever it publishes unless told otherwise,
 * so a pre-release (`1.0.0-beta.1`) left to that default would become the
 * version `npm install` resolves. A pre-release therefore publishes under
 * `next`, and only a normal release takes npm's `latest`.
 * @param version Version being published, from the package manifest.
 * @returns `"next"` for a pre-release version, `undefined` to accept npm's `latest`.
 */
export function distTagForVersion(version: string): string | undefined {
  const [, ...preRelease] = (version.split("+")[0] ?? version).split("-");
  return preRelease.length > 0 ? "next" : undefined;
}

/** Runs `npm publish` for one package. Injected by tests. */
export type PublishRunner = (
  workspacePackage: WorkspacePackage,
  timeoutMs?: number,
) => Promise<{ isSuccess: boolean; output: string }>;

/**
 * Publishes one package with npm.
 *
 * A pre-release version is published under the `next` dist-tag so it does not
 * take `latest` from the current stable release; see {@link distTagForVersion}.
 *
 * No `--provenance` flag is passed. Under npm trusted publishing the registry
 * generates a provenance attestation on its own, and the flag is rejected
 * outside a supported CI provider — passing it would buy nothing in the
 * workflow and break the same command on a maintainer's machine.
 * @param workspacePackage Package to publish.
 * @param timeoutMs Milliseconds before npm is killed, or `undefined` to wait indefinitely.
 * @returns Whether npm succeeded, with its combined output.
 */
export const runNpmPublish: PublishRunner = async (workspacePackage, timeoutMs) => {
  const distTag = distTagForVersion(String(workspacePackage.manifest.version));
  const outcome = await execute(
    {
      args: ["publish", "--access", "public", ...(distTag === undefined ? [] : ["--tag", distTag])],
      command: "npm",
      cwd: workspacePackage.directory,
    },
    { stdio: "pipe", timeoutMs },
  );
  return { isSuccess: outcome.isSuccess, output: outcome.output ?? "" };
};

/** Reads the version a registry currently serves for a package. Injected by tests. */
export type RegistryReader = (workspacePackage: WorkspacePackage, timeoutMs?: number) => Promise<string | undefined>;

/**
 * Reads back the version npm serves for a package.
 *
 * `docs/specs/packages-lifecycle.md` asks for this confirmation after every
 * publish. It is a report and never a gate: registry metadata propagates
 * eventually, so a version that has not appeared yet means "check again in a
 * moment", not "the publish failed".
 * @param workspacePackage Package to look up.
 * @param timeoutMs Milliseconds before npm is killed, or `undefined` to wait indefinitely.
 * @returns The published version, or `undefined` when the registry did not answer with one.
 */
export const readPublishedVersion: RegistryReader = async (workspacePackage, timeoutMs) => {
  const outcome = await execute(
    { args: ["view", workspacePackage.name, "version", "--json"], command: "npm", cwd: workspacePackage.directory },
    { stdio: "pipe", timeoutMs },
  );
  if (!outcome.isSuccess) {
    return undefined;
  }
  try {
    return (JSON.parse(outcome.stdout || '""') as string) || undefined;
  } catch {
    return undefined;
  }
};

/** Reads whether the registry already serves a package's manifest version. Injected by tests. */
export type VersionLookup = (workspacePackage: WorkspacePackage, timeoutMs?: number) => Promise<boolean>;

/**
 * Reads whether the exact version in a package's manifest is already on npm.
 *
 * Any doubt answers `false`: an unreachable registry then leads to a publish
 * attempt, which npm itself refuses for an existing version, rather than to a
 * run that reports success without having published anything.
 * @param workspacePackage Package whose manifest version to look up.
 * @param timeoutMs Milliseconds before npm is killed, or `undefined` to wait indefinitely.
 * @returns Whether the registry answered with exactly that version.
 */
export const isVersionPublished: VersionLookup = async (workspacePackage, timeoutMs) => {
  const version = String(workspacePackage.manifest.version);
  const outcome = await execute(
    {
      args: ["view", `${workspacePackage.name}@${version}`, "version", "--json"],
      command: "npm",
      cwd: workspacePackage.directory,
    },
    { stdio: "pipe", timeoutMs },
  );
  if (!outcome.isSuccess) {
    return false;
  }
  try {
    return JSON.parse(outcome.stdout || '""') === version;
  } catch {
    return false;
  }
};

/** Resolves a git revision to the commit it names. Injected by tests. */
export type RevisionResolver = (revision: string, cwd: string) => Promise<string | undefined>;

const resolveRevision: RevisionResolver = async (revision, cwd) => {
  const outcome = await execute(
    { args: ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`], command: "git", cwd },
    { stdio: "pipe" },
  );
  return outcome.isSuccess ? outcome.stdout?.trim() || undefined : undefined;
};

/**
 * The release tag that records a package's manifest version.
 * @param workspacePackage Package to name the tag for.
 * @returns Tag name, such as `@codenhub/error@0.3.0`.
 */
export function releaseTagFor(workspacePackage: WorkspacePackage): string {
  return `${workspacePackage.name}@${String(workspacePackage.manifest.version)}`;
}

/**
 * Checks that a package's release tag exists and names the commit being published.
 *
 * Every version on npm must have a tag, because the tag is how the rest of the
 * repository — the documentation site first — tells a released package from
 * an unreleased one. A publish without one would put a version on npm that the
 * repository cannot see. In the workflow the tag is what was checked out, so
 * this passes by construction; it exists for the manual first release.
 * @param workspacePackage Package about to be published.
 * @param resolve Revision resolver, defaulting to `git rev-parse`.
 * @returns A `tag` precondition in the shape the preflight reports.
 */
export async function checkReleaseTag(
  workspacePackage: WorkspacePackage,
  resolve: RevisionResolver = resolveRevision,
): Promise<ReadinessCheck> {
  const tag = releaseTagFor(workspacePackage);
  const [tagged, head] = await Promise.all([
    resolve(`refs/tags/${tag}`, workspacePackage.directory),
    resolve("HEAD", workspacePackage.directory),
  ]);
  if (tagged === undefined) {
    return {
      detail: `no ${tag} tag; tag the commit being published: git tag "${tag}"`,
      name: "tag",
      status: "blocked",
    };
  }
  if (head === undefined) {
    return { detail: "git could not resolve HEAD", name: "tag", status: "unknown" };
  }
  if (tagged !== head) {
    return {
      detail: `${tag} names ${tagged.slice(0, 7)}, but HEAD is ${head.slice(0, 7)}; check out the tag to publish it`,
      name: "tag",
      status: "blocked",
    };
  }
  return { detail: `${tag} names HEAD`, name: "tag", status: "ready" };
}
