import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { PublicResource } from "@codenhub/tools/documentation";

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
