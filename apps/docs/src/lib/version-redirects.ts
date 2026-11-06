import { resolveDocsVersionRedirects } from "@codenhub/tools/release";

import type { VersionRedirects } from "./version-redirect-target";

/** A package whose versions the site serves, as its redirects need it. */
export interface VersionRedirectInput {
  /** Archived versions the build served. */
  archived: readonly string[];
  current: string;
  slug: string;
  /** Every released version, pre-releases included. */
  versions: readonly string[];
}

/**
 * Maps each stable release the site does not serve to the route of the version
 * it redirects to (`docs/specs/packages-docs-versions.md`, "URLs").
 * @param packages Each package with versions in the snapshot.
 * @returns Per package slug, each such release and its target's route prefix; packages with none are left out.
 */
export function buildVersionRedirects(packages: readonly VersionRedirectInput[]): VersionRedirects {
  const redirects: VersionRedirects = {};
  for (const { archived, current, slug, versions } of packages) {
    const releases = resolveDocsVersionRedirects(versions, { archived: [...archived], current });
    if (releases.length > 0) {
      redirects[slug] = Object.fromEntries(
        releases.map(({ from, to }) => [from, to === undefined ? slug : `${slug}/${to}`]),
      );
    }
  }
  return redirects;
}
