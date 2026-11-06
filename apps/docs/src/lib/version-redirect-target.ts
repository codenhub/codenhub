/**
 * Per package slug, each release the site does not serve and the route prefix
 * it redirects to: the slug for the current version, `<slug>/<version>` for an
 * archived one.
 *
 * This module runs in the not-found page's script, so it imports nothing.
 */
export type VersionRedirects = Record<string, Record<string, string>>;

/**
 * Finds where a missing page of a release the site does not serve has moved.
 *
 * English pages sit at the root and each other locale under a one-segment
 * prefix, which the target keeps, as it keeps the page path after the version.
 * @param pathname The requested path, such as `/es/error/0.4.2/guides/setup/`.
 * @param redirects The site's version redirects.
 * @param localePrefixes Every locale prefix other than English's empty one.
 * @returns The path in the version to open, or `undefined` when the path names no such release.
 */
export function findVersionRedirect(
  pathname: string,
  redirects: VersionRedirects,
  localePrefixes: readonly string[],
): string | undefined {
  const segments = pathname.split("/");
  // `segments[0]` is the empty string before the leading slash.
  const offset = localePrefixes.includes(segments[1] ?? "") ? 2 : 1;
  const slug = segments[offset];
  const version = segments[offset + 1];
  if (slug === undefined || version === undefined) {
    return undefined;
  }
  // Own keys only, so a path such as `/toString/constructor/` matches nothing.
  const releases = Object.hasOwn(redirects, slug) ? redirects[slug] : undefined;
  const target = releases !== undefined && Object.hasOwn(releases, version) ? releases[version] : undefined;
  if (target === undefined) {
    return undefined;
  }
  return [...segments.slice(0, offset), target, ...segments.slice(offset + 2)].join("/") || "/";
}
