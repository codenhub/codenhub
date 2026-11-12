/**
 * URL builders for a page scoped to one package -- a docs page or a package's
 * own demo -- to link "Documentation", "Demo", npm, and GitHub at that package
 * instead of at the site root a `SiteConfig` otherwise points to.
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

/**
 * The package's directory on GitHub, from its manifest `repository`.
 *
 * Reads `repository` rather than `homepage`, which may point at the package's
 * page on the main site instead of at GitHub.
 * @param manifest The package's parsed `package.json`.
 * @returns The package's GitHub directory URL, the repository root when
 *   `repository` has no `directory`, or `undefined` when `repository` is
 *   missing or not a GitHub repository.
 */
export function packageGithubUrl(manifest: unknown): string | undefined {
  const repository =
    typeof manifest === "object" && manifest !== null ? (manifest as { repository?: unknown }).repository : undefined;
  const fields =
    typeof repository === "string"
      ? { url: repository }
      : typeof repository === "object" && repository !== null
        ? (repository as { directory?: unknown; url?: unknown })
        : {};
  if (typeof fields.url !== "string") {
    return undefined;
  }
  const match = /^(?:git\+)?https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/u.exec(fields.url);
  if (match === null) {
    return undefined;
  }
  const directory = typeof fields.directory === "string" ? fields.directory.split("/").filter(Boolean).join("/") : "";
  return directory === "" ? `https://github.com/${match[1]}` : `https://github.com/${match[1]}/tree/main/${directory}`;
}
