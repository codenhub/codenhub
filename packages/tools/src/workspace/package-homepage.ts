const PACKAGE_PAGE_ORIGIN = "https://codenhub.dev/packages/";
const SOURCE_TREE = "https://github.com/codenhub/codenhub/tree/main/";

/** The `homepage` a package is expected to declare, and what that URL is. */
export interface ExpectedHomepage {
  /** Expected `homepage` value. */
  url: string;
  /** What the URL points to, for a finding message. */
  describes: string;
}

/**
 * The `homepage` "Package metadata" in `docs/specs/packages-lifecycle.md` asks for:
 * the package list page of a listed package, and the GitHub directory of an unlisted one.
 * @param options Where the package lives and how the package list shows it.
 * @param options.listed Whether the package list shows the package.
 * @param options.location Workspace-relative POSIX package directory, such as `packages/theme`.
 * @param options.slug The package's documentation slug.
 * @returns The expected URL and what it points to.
 */
export function expectedHomepage(options: { listed: boolean; location: string; slug: string }): ExpectedHomepage {
  return options.listed
    ? { describes: "package page of a listed package", url: `${PACKAGE_PAGE_ORIGIN}${options.slug}/` }
    : { describes: "GitHub directory of an unlisted package", url: `${SOURCE_TREE}${options.location}` };
}
