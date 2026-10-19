import { SEMANTIC_VERSION } from "./cut.ts";
import { parseReleaseTag } from "./publish.ts";
import { listTags, runGit, type GitRunner } from "./published-tags.ts";
import { compareVersions } from "./readiness.ts";

/** One commit that touched a package after its last release. */
export interface UnreleasedCommit {
  /** Abbreviated commit hash. */
  hash: string;
  /** First line of the commit message. */
  subject: string;
}

/** What a package's next release would carry, as git records it. */
export interface UnreleasedChanges {
  /** Commits since `tag`, newest first. */
  commits: UnreleasedCommit[];
  /** The newest release tag, or `undefined` when the package was never released. */
  tag: string | undefined;
}

/**
 * Picks the newest release tag for a package, pre-releases included.
 *
 * Unlike {@link resolveLatestPublishedTag}, which answers what a consumer
 * installs by default, this answers what was released last: a commit that went
 * out in `0.3.0-beta.1` is not waiting for a release. A tag whose version is
 * not a semantic version is skipped, since `compareVersions` would rank it
 * above every real one.
 * @param packageName Package name as it appears in a release tag, such as `@codenhub/error`.
 * @param tags Candidate tags.
 * @returns The newest matching tag, or `undefined` when the package has none.
 */
export function resolveLatestReleaseTag(packageName: string, tags: readonly string[]): string | undefined {
  let latest: { tag: string; version: string } | undefined;
  for (const tag of tags) {
    const release = parseReleaseTag(tag);
    if (release?.name !== packageName || !SEMANTIC_VERSION.test(release.version)) {
      continue;
    }
    if (latest === undefined || compareVersions(release.version, latest.version) > 0) {
      latest = { tag, version: release.version };
    }
  }
  return latest?.tag;
}

/**
 * Lists the commits that touched a package's directory since its last release.
 *
 * Merge commits are left out: every pull request lands as one, and it repeats
 * the commits it merges. A change made outside the directory, such as a catalog
 * bump in `pnpm-workspace.yaml`, is not listed even when it reaches the package.
 * @param packageName Full package name, such as `@codenhub/error`.
 * @param location Package directory relative to the repository root, such as `packages/error`.
 * @param root Repository root.
 * @param git Git runner, defaulting to a real `git`.
 * @returns The newest release tag and the commits after it.
 * @throws When git cannot list tags or read the history.
 */
export async function readUnreleasedChanges(
  packageName: string,
  location: string,
  root: string,
  git: GitRunner = runGit,
): Promise<UnreleasedChanges> {
  const tag = resolveLatestReleaseTag(packageName, await listTags(root, git));
  const range = tag === undefined ? "HEAD" : `${tag}..HEAD`;
  const outcome = await git(["log", "--no-merges", "--format=%h%x09%s", range, "--", location], root);
  if (!outcome.isSuccess) {
    throw new Error(`Could not read the history of ${location} in ${root}.`);
  }
  const commits = outcome.stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line): UnreleasedCommit => {
      const separator = line.indexOf("\t");
      return { hash: line.slice(0, separator), subject: line.slice(separator + 1).trim() };
    });
  return { commits, tag };
}
