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

// `major.minor.patch` and nothing more: no pre-release, no build metadata.
const STABLE_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Reports whether a version is a stable release rather than a pre-release.
 * @param version Version as written in a release tag, such as `0.3.0` or `0.3.1-beta.1`.
 * @returns `true` for a plain `major.minor.patch` version.
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
