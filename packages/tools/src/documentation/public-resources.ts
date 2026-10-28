import { posix } from "node:path";

import { rewriteMarkdownTargets } from "./llms-full.ts";

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
 * Derives the documentation-site route a package-relative file is published at.
 *
 * Public `docs/` Markdown becomes a page, other public `docs/` files keep their
 * names below the package route, and package-root `LICENSE`, `NOTICE`,
 * `llms.txt`, and `llms-full.txt` are published as they are.
 * @param slug Package documentation slug.
 * @param packagePath Package-relative POSIX path.
 * @returns Site route, or `undefined` when the site does not publish the file.
 */
export function resolveSiteRoute(slug: string, packagePath: string): string | undefined {
  const normalizedPath = normalizePath(packagePath);
  if (ROOT_RESOURCES.has(normalizedPath)) {
    return `/${slug}/${normalizedPath}`;
  }
  if (
    !normalizedPath.startsWith("docs/") ||
    normalizedPath.startsWith("docs/internal/") ||
    normalizedPath.startsWith("docs/plans/")
  ) {
    return undefined;
  }
  const relativePath = normalizedPath.slice("docs/".length);
  if (relativePath.split("/").some((segment) => segment.startsWith("."))) {
    return undefined;
  }
  if (!relativePath.toLowerCase().endsWith(".md")) {
    return `/${slug}/${relativePath}`;
  }
  const pageRoute = relativePath.replace(/\.md$/i, "").replace(/(^|\/)index$/i, "");
  return `/${slug}/${pageRoute}`.replace(/\/$/, "") + "/";
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
    .filter(
      (packagePath) =>
        packagePath.startsWith("docs/") &&
        !packagePath.startsWith("docs/internal/") &&
        !packagePath.startsWith("docs/plans/") &&
        packagePath.toLowerCase().endsWith(".md"),
    )
    .map((packagePath) => {
      const relativePath = packagePath.slice("docs/".length).replace(/\.md$/i, "");
      const routePath = relativePath.replace(/(^|\/)index$/i, "");
      return `/${slug}/${routePath}`.replace(/\/$/, "") + "/index.html";
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
