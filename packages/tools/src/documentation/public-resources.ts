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
 * Finds the files a package publishes alongside its documentation pages.
 *
 * Public `docs/` assets keep their package-relative names, and package-root
 * `LICENSE` and `NOTICE` are published because public documents may link to them.
 * @param slug Package documentation slug.
 * @param packageFiles Every package-relative file path.
 * @returns Publishable resources ordered by route.
 * @throws When two resources share a route or a resource collides with a page.
 */
export function discoverPublicResources(slug: string, packageFiles: readonly string[]): DiscoveredResource[] {
  const normalizedFiles = packageFiles.map(normalizePath);
  const resources = normalizedFiles.flatMap((packagePath): DiscoveredResource[] => {
    if (packagePath === "LICENSE" || packagePath === "NOTICE") {
      return [{ packagePath, routePath: `/${slug}/${packagePath}` }];
    }
    if (
      !packagePath.startsWith("docs/") ||
      packagePath.startsWith("docs/internal/") ||
      packagePath
        .slice("docs/".length)
        .split("/")
        .some((segment) => segment.startsWith(".")) ||
      packagePath.toLowerCase().endsWith(".md")
    ) {
      return [];
    }
    return [{ packagePath, routePath: `/${slug}/${packagePath.slice("docs/".length)}` }];
  });
  const documentOutputs = normalizedFiles
    .filter(
      (packagePath) =>
        packagePath.startsWith("docs/") &&
        !packagePath.startsWith("docs/internal/") &&
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
