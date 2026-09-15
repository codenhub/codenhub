/**
 * URL builders for a page scoped to one package -- a docs page or a package's
 * own demo -- to link "Documentation", "Demo", npm, and GitHub at that package
 * instead of at the site root a `SiteConfig` otherwise points to.
 *
 * There is no `packageGithubUrl`: every public package's `package.json`
 * `homepage` already is that package's scoped GitHub URL (see
 * `packages/tools/src/scaffold/package-template.ts`), so a caller reads it
 * directly rather than reconstructing it here.
 */

/**
 * Scopes a docs site's root URL to one package's documentation route.
 *
 * Matches the route `apps/docs` actually serves a package's overview page at
 * (`/${slug}/`), so a caller building a `SiteConfig` for a package-scoped page
 * can point "Documentation" at that package instead of the docs site's root.
 * @param docsUrl The docs site's root origin, e.g. `https://docs.codenhub.dev`.
 * @param slug The package's documentation/demo path segment.
 * @returns The package's scoped documentation URL.
 */
export function packageDocsUrl(docsUrl: string, slug: string): string {
  return `${docsUrl}/${slug}/`;
}

/**
 * Scopes a demo site's root URL to one package's mounted demo.
 *
 * Matches the URL scheme in `docs/specs/packages-demo.md`
 * (`{DEMO_BASE_URL}/<package>/`). Only call this for a package that actually
 * publishes a `demo/` -- there is nothing to link to otherwise.
 * @param demoUrl The demo site's root origin, e.g. `https://demo.codenhub.dev`.
 * @param slug The package's documentation/demo path segment.
 * @returns The package's scoped demo URL.
 */
export function packageDemoUrl(demoUrl: string, slug: string): string {
  return `${demoUrl}/${slug}/`;
}

/**
 * The npm listing URL for a published package.
 * @param packageName The full, scoped npm package name, e.g. `@codenhub/icons`.
 * @returns The package's npmjs.com listing URL.
 */
export function packageNpmUrl(packageName: string): string {
  return `https://www.npmjs.com/package/${packageName}`;
}
