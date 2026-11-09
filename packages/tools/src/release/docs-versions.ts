import { major, maxSatisfying, rcompare, satisfies, valid } from "semver";

import { isStableVersion } from "./published-tags.ts";

/** The versions of one package the documentation site keeps (`docs/specs/packages-docs-versions.md`). */
export interface KeptDocsVersions {
  /** Newest stable release, served at the unversioned URL; absent when the package has none. */
  current?: string;
  /** Archived versions, newest first, each served under its exact version. */
  archived: string[];
}

/** Where a release the site does not keep sends a reader. */
export interface DocsVersionRedirect {
  /** Release that is not kept. */
  from: string;
  /** Kept archived version to send it to, or `undefined` for the current version. */
  to?: string;
}

function stableNewestFirst(versions: readonly string[]): string[] {
  // `isStableVersion` admits leading zeros, such as `01.2.3`, which `semver` throws on.
  return [...new Set(versions.filter((version) => isStableVersion(version) && valid(version) !== null))].sort(rcompare);
}

/**
 * Picks the versions the documentation site keeps for a package.
 *
 * The current version is the newest stable release. Archived are, apart from
 * it, the newest stable release of each major from 1.0 other than the current
 * one's, and the newest stable release each `codenhub.docs.versions` entry
 * matches. Before 1.0 nothing is archived by rule.
 * @param versions Every released version of the package, pre-releases included.
 * @param entries SemVer ranges from `codenhub.docs.versions`.
 * @returns The current version and the archived ones.
 */
export function selectDocsVersions(versions: readonly string[], entries: readonly string[] = []): KeptDocsVersions {
  const stable = stableNewestFirst(versions);
  const [current] = stable;
  if (current === undefined) {
    return { archived: [] };
  }
  const archived = new Set<string>();
  const majors = new Set<number>([major(current)]);
  for (const version of stable) {
    const versionMajor = major(version);
    if (versionMajor >= 1 && !majors.has(versionMajor)) {
      majors.add(versionMajor);
      archived.add(version);
    }
  }
  for (const entry of entries) {
    const match = maxSatisfying(stable, entry);
    if (match !== null && match !== current) {
      archived.add(match);
    }
  }
  return { archived: [...archived].sort(rcompare), current };
}

/**
 * Lists the `codenhub.docs.versions` entries no stable release satisfies, which keep nothing.
 * @param versions Every released version of the package.
 * @param entries SemVer ranges from `codenhub.docs.versions`.
 * @returns The entries that match no stable release, in list order.
 */
export function findUnmatchedDocsVersions(versions: readonly string[], entries: readonly string[]): string[] {
  const stable = stableNewestFirst(versions);
  return entries.filter((entry) => maxSatisfying(stable, entry) === null);
}

/**
 * Says where each stable release that is not kept redirects.
 *
 * A release goes to the newest kept version that satisfies `^<release>`, or to
 * the current version when none does. The current version's own number goes to
 * the unversioned URL.
 * @param versions Every released version of the package.
 * @param kept What the site serves: the current version and the archived versions it built.
 * @returns One redirect per stable release that is not archived, newest first.
 */
export function resolveDocsVersionRedirects(
  versions: readonly string[],
  kept: KeptDocsVersions,
): DocsVersionRedirect[] {
  const { current } = kept;
  if (current === undefined) {
    return [];
  }
  const archived = new Set(kept.archived);
  return stableNewestFirst(versions)
    .filter((version) => !archived.has(version))
    .map((version) => {
      const line = `^${version}`;
      const to = satisfies(current, line) ? null : maxSatisfying(kept.archived, line);
      return to === null ? { from: version } : { from: version, to };
    });
}
