import { posix } from "node:path";

import { rewriteMarkdownTargets } from "./llms-full.ts";
import { isTranslationLocale, splitTranslatedDocsPath } from "./translation-paths.ts";

const ROOT_RESOURCES = new Set(["LICENSE", "NOTICE", "llms-full.txt", "llms.txt"]);

/** A non-Markdown file a package publishes under its documentation route. */
export interface PublicResource {
  /** Package-relative POSIX path. */
  packagePath: string;
  /** Absolute package directory. */
  rootPath: string;
  /** Route the resource is served at. */
  routePath: string;
}

/** A public resource before it is bound to a package directory. */
export type DiscoveredResource = Omit<PublicResource, "rootPath">;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * Splits a public `docs/` file into the route prefix it is published under and
 * its path below that prefix.
 *
 * English is published under `/<slug>/`, and a translation in a listed locale
 * under `/<locale>/<slug>/` at the path it mirrors
 * (`docs/specs/packages-translations.md`, "Documentation site"). A file in an
 * unlisted locale area is not published.
 * @param slug Package documentation slug.
 * @param normalizedPath Package-relative POSIX path.
 * @returns The route prefix and `docs/`-relative path, or `undefined` for a file the site does not publish.
 */
function splitPublicDocsPath(
  slug: string,
  normalizedPath: string,
): { prefix: string; relativePath: string } | undefined {
  if (
    !normalizedPath.startsWith("docs/") ||
    normalizedPath.startsWith("docs/internal/") ||
    normalizedPath.startsWith("docs/plans/")
  ) {
    return undefined;
  }
  const docsRelative = normalizedPath.slice("docs/".length);
  if (docsRelative.split("/").some((segment) => segment.startsWith("."))) {
    return undefined;
  }
  const translation = splitTranslatedDocsPath(docsRelative);
  if (translation === undefined) {
    return { prefix: `/${slug}`, relativePath: docsRelative };
  }
  return isTranslationLocale(translation.locale)
    ? { prefix: `/${translation.locale}/${slug}`, relativePath: translation.relativePath }
    : undefined;
}

/**
 * Derives the documentation-site route a package-relative file is published at.
 *
 * Public `docs/` Markdown becomes a page, other public `docs/` files keep their
 * names below the package route, and package-root `LICENSE`, `NOTICE`,
 * `llms.txt`, and `llms-full.txt` are published as they are. A translation
 * under `docs/<locale>/` is published below `/<locale>/<slug>/` at the path it
 * mirrors.
 * @param slug Package documentation slug.
 * @param packagePath Package-relative POSIX path.
 * @returns Site route, or `undefined` when the site does not publish the file.
 */
export function resolveSiteRoute(slug: string, packagePath: string): string | undefined {
  const normalizedPath = normalizePath(packagePath);
  if (ROOT_RESOURCES.has(normalizedPath)) {
    return `/${slug}/${normalizedPath}`;
  }
  const publicPath = splitPublicDocsPath(slug, normalizedPath);
  if (publicPath === undefined) {
    return undefined;
  }
  const { prefix, relativePath } = publicPath;
  if (!relativePath.toLowerCase().endsWith(".md")) {
    return `${prefix}/${relativePath}`;
  }
  const pageRoute = relativePath.replace(/\.md$/i, "").replace(/(^|\/)index$/i, "");
  return `${prefix}/${pageRoute}`.replace(/\/$/, "") + "/";
}

/**
 * Prepares an `llms.txt` or `llms-full.txt` for publication on the documentation site.
 *
 * Package-relative targets the site publishes become absolute site URLs, so the
 * file still resolves when it is read without its URL, such as pasted into a
 * prompt. Targets the site does not publish, such as `README.md`, are kept as
 * authored.
 * @param source File contents, with targets relative to the package root.
 * @param site Site origin and package slug the file is published under.
 * @returns File contents with published targets made absolute.
 */
export function publishLlmsText(source: string, site: { siteUrl: string; slug: string }): string {
  return rewriteMarkdownTargets(source, (target) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(target)) {
      return target;
    }
    const suffixIndex = target.search(/[?#]/);
    const path = posix.normalize(suffixIndex === -1 ? target : target.slice(0, suffixIndex));
    const suffix = suffixIndex === -1 ? "" : target.slice(suffixIndex);
    const routePath = path.startsWith("../") ? undefined : resolveSiteRoute(site.slug, path);
    return routePath === undefined ? target : `${new URL(routePath, site.siteUrl).href}${suffix}`;
  });
}

/**
 * Finds the files a package publishes alongside its documentation pages.
 *
 * Public `docs/` assets keep their package-relative names. Package-root
 * `LICENSE` and `NOTICE` are published because public documents may link to
 * them, and `llms.txt` and `llms-full.txt` so LLMs can read them without
 * installing the package.
 * @param slug Package documentation slug.
 * @param packageFiles Every package-relative file path.
 * @returns Publishable resources ordered by route.
 * @throws When two resources share a route or a resource collides with a page.
 */
export function discoverPublicResources(slug: string, packageFiles: readonly string[]): DiscoveredResource[] {
  const normalizedFiles = packageFiles.map(normalizePath);
  const resources = normalizedFiles.flatMap((packagePath): DiscoveredResource[] => {
    const routePath = packagePath.toLowerCase().endsWith(".md") ? undefined : resolveSiteRoute(slug, packagePath);
    return routePath === undefined ? [] : [{ packagePath, routePath }];
  });
  const documentOutputs = normalizedFiles
    .filter((packagePath) => packagePath.toLowerCase().endsWith(".md"))
    .flatMap((packagePath) => {
      const routePath = resolveSiteRoute(slug, packagePath);
      return routePath === undefined ? [] : [`${routePath}index.html`];
    });
  const resourceRoutes = new Set<string>();
  for (const resource of resources) {
    const portableRoute = resource.routePath.toLowerCase();
    if (resourceRoutes.has(portableRoute)) {
      throw new Error(`Duplicate public resource route ${resource.routePath}.`);
    }
    resourceRoutes.add(portableRoute);
    if (
      documentOutputs.some(
        (outputPath) =>
          outputPath.toLowerCase() === portableRoute ||
          outputPath.toLowerCase().startsWith(`${portableRoute}/`) ||
          portableRoute.startsWith(`${outputPath.toLowerCase()}/`),
      )
    ) {
      throw new Error(`Public resource ${resource.packagePath} collides with a documentation page.`);
    }
  }
  return resources.sort((left, right) => compareText(left.routePath, right.routePath));
}
