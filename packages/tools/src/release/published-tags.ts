import { execute } from "../process/execute.ts";
import { parseReleaseTag, type ReleaseTag } from "./publish.ts";
import { compareVersions } from "./readiness.ts";

/** Runs a git command and returns its outcome. Injected by tests. */
export type GitRunner = (args: readonly string[], cwd: string) => Promise<{ isSuccess: boolean; stdout: string }>;

const runGit: GitRunner = async (args, cwd) => {
  const outcome = await execute({ args, command: "git", cwd }, { stdio: "pipe" });
  return { isSuccess: outcome.isSuccess, stdout: outcome.stdout ?? "" };
};

/**
 * Fetches every release tag from `origin` into the local repository.
 *
 * A build checkout is not guaranteed to carry tags on its own — a shallow or
 * branch-only clone would otherwise make every package look unpublished, which
 * a build cannot tell apart from a package that genuinely never released. This
 * is safe to call before every resolution; a fetch that finds nothing new is a
 * no-op.
 * @param cwd Repository directory to run `git` in.
 * @param git Git runner, defaulting to a real `git fetch`.
 * @returns Whether the fetch succeeded.
 */
export async function fetchReleaseTags(cwd: string, git: GitRunner = runGit): Promise<boolean> {
  const outcome = await git(["fetch", "--tags", "--force", "origin"], cwd);
  return outcome.isSuccess;
}

/**
 * Lists every tag in the local repository.
 *
 * Zero tags is a legitimate result — a repository can genuinely have none —
 * so it is returned as an empty list rather than treated as failure. A git
 * command that fails outright throws instead: a caller that treated it the
 * same as "no tags" would resolve every package as unpublished and fall back
 * to live, unreleased content, which is the one outcome this whole mechanism
 * exists to prevent.
 * @param cwd Repository directory to run `git` in.
 * @param git Git runner, defaulting to a real `git tag --list`.
 * @returns Every local tag name, in no particular order.
 * @throws When the underlying `git tag --list` command fails.
 */
export async function listTags(cwd: string, git: GitRunner = runGit): Promise<string[]> {
  const outcome = await git(["tag", "--list"], cwd);
  if (!outcome.isSuccess) {
    throw new Error(`Could not list git tags in ${cwd}.`);
  }
  return outcome.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

// `major.minor.patch` with no pre-release. Build metadata does not make a
// version a pre-release: `distTagForVersion` publishes it under `latest`.
const STABLE_VERSION = /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Reports whether a version is a stable release rather than a pre-release.
 * @param version Version as written in a release tag, such as `0.3.0` or `0.3.1-beta.1`.
 * @returns `true` for `major.minor.patch` with no pre-release, build metadata (`+build.5`) allowed.
 */
export function isStableVersion(version: string): boolean {
  return STABLE_VERSION.test(version);
}

/**
 * Picks the newest stable release tag for a package out of a set of tags.
 *
 * A build that wants to show only published content resolves a package's name
 * against this rather than against the working tree. Pre-releases are skipped:
 * they publish under the `next` dist-tag, so the version `npm install` resolves
 * by default, and the one to document, is the newest stable one. A package
 * absent here has never published a stable version; callers decide their own fallback for that case rather than
 * treating it as an error, since an unpublished package is a normal state
 * (`docs/roadmap.md` tracks several).
 * @param packageName Package name as it appears in a release tag, such as `@codenhub/error`.
 * @param tags Candidate tags, such as the output of {@link listTags}.
 * @returns The newest stable matching tag, or `undefined` when the package has none.
 */
export function resolveLatestPublishedTag(packageName: string, tags: readonly string[]): string | undefined {
  const releases = tags
    .map((tag): { release: ReleaseTag; tag: string } | undefined => {
      const release = parseReleaseTag(tag);
      return release === undefined ? undefined : { release, tag };
    })
    .filter((candidate): candidate is { release: ReleaseTag; tag: string } => candidate !== undefined)
    .filter(({ release }) => release.name === packageName && isStableVersion(release.version));

  return releases.reduce<{ release: ReleaseTag; tag: string } | undefined>((latest, candidate) => {
    if (latest === undefined || compareVersions(candidate.release.version, latest.release.version) > 0) {
      return candidate;
    }
    return latest;
  }, undefined)?.tag;
}

/** One released version of a package, as its release tag records it. */
export interface PackageRelease {
  /** Committer date of the commit the tag names, as an ISO 8601 string. */
  date: string;
  /** Whether the version is a pre-release, which publishes under the `next` dist-tag. */
  isPrerelease: boolean;
  /** Version the tag releases, such as `0.3.0`. */
  version: string;
}

/**
 * Lists every local tag with the date of the commit it names.
 *
 * Release tags here are lightweight, so a tag has no date of its own: this is
 * the date of the release commit, which can precede the npm publish by however
 * long the tag waited to be pushed.
 * @param cwd Directory inside the repository.
 * @param git Git runner, defaulting to a real `git for-each-ref`.
 * @returns Tag names mapped to ISO 8601 commit dates.
 * @throws When the underlying `git for-each-ref` command fails.
 */
export async function listTagDates(cwd: string, git: GitRunner = runGit): Promise<Map<string, string>> {
  const outcome = await git(
    [
      "for-each-ref",
      "--format=%(refname:short)%09%(*committerdate:iso-strict)%(committerdate:iso-strict)",
      "refs/tags",
    ],
    cwd,
  );
  if (!outcome.isSuccess) {
    throw new Error(`Could not list git tags in ${cwd}.`);
  }
  const entries = outcome.stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line): [string, string] => {
      const [tag = "", date = ""] = line.trim().split("\t");
      // A tag that names no commit has no date; a release would be missing
      // from the history rather than reported, so it fails here instead.
      if (tag === "" || date === "") {
        throw new Error(`Could not read the commit date of tag "${line.trim()}" in ${cwd}.`);
      }
      return [tag, date];
    });
  return new Map(entries);
}

/**
 * Collects a package's releases from its release tags.
 * @param packageName Full package name, such as `@codenhub/error`.
 * @param tagDates Tag names mapped to dates, as {@link listTagDates} returns them.
 * @returns The package's releases, newest version first.
 */
export function collectReleases(packageName: string, tagDates: ReadonlyMap<string, string>): PackageRelease[] {
  return [...tagDates]
    .flatMap(([tag, date]): PackageRelease[] => {
      const release = parseReleaseTag(tag);
      return release === undefined || release.name !== packageName
        ? []
        : [{ date, isPrerelease: !isStableVersion(release.version), version: release.version }];
    })
    .sort((left, right) => compareVersions(right.version, left.version));
}
