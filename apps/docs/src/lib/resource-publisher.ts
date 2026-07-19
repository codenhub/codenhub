import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface PublicResource {
  packagePath: string;
  rootPath: string;
  routePath: string;
}

interface DiscoveredResource extends Omit<PublicResource, "rootPath"> {}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function discoverPublicResources(slug: string, packageFiles: string[]): DiscoveredResource[] {
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

function getResourcePath(resource: PublicResource): string {
  const sourcePath = path.resolve(resource.rootPath, resource.packagePath);
  const rootPrefix = `${path.resolve(resource.rootPath)}${path.sep}`;
  if (!sourcePath.startsWith(rootPrefix)) {
    throw new Error(`Resource path escapes package root: ${resource.packagePath}`);
  }
  return sourcePath;
}

export function createResourceMiddleware(resources: PublicResource[]) {
  const resourcesByRoute = new Map(resources.map((resource) => [resource.routePath, resource]));
  return async (request: Request): Promise<Response | undefined> => {
    let routePath: string;
    try {
      routePath = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return undefined;
    }
    if (routePath.split("/").includes("..")) {
      return undefined;
    }
    const resource = resourcesByRoute.get(routePath);
    if (resource === undefined) {
      return undefined;
    }
    const content = await readFile(getResourcePath(resource));
    const contentType = ["LICENSE", "NOTICE"].includes(resource.packagePath)
      ? "text/plain; charset=utf-8"
      : (CONTENT_TYPES[path.extname(resource.packagePath).toLowerCase()] ?? "application/octet-stream");
    return new Response(content, { headers: { "content-type": contentType } });
  };
}

export async function copyPublicResources(resources: PublicResource[], outputPath: string): Promise<void> {
  await Promise.all(
    resources.map(async (resource) => {
      const destinationPath = path.join(outputPath, ...resource.routePath.split("/").filter(Boolean));
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyFile(getResourcePath(resource), destinationPath);
    }),
  );
}
