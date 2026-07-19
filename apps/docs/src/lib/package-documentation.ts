import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parsePackageMetadata } from "./catalog-core";
import { createDocumentGraph, validateDocumentGraph } from "./document-graph";
import { type CommandRunner, readNpmPackInventory } from "./package-inventory";
import { discoverPublicResources, type PublicResource } from "./resource-publisher";

interface LoadPackageOptions {
  rootPath: string;
  runCommand?: CommandRunner;
  slug: string;
}

type PackageDocumentationLoader = (options: LoadPackageOptions) => Promise<PublicResource[]>;

async function listFiles(rootPath: string, relativePath = ""): Promise<string[]> {
  const directoryPath = path.join(rootPath, relativePath);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = path.posix.join(relativePath.replaceAll("\\", "/"), entry.name);
      if (entry.isSymbolicLink() || entry.name === "node_modules" || entry.name === ".git") {
        return [];
      }
      if (entry.isDirectory()) {
        return listFiles(rootPath, entryPath);
      }
      return entry.isFile() ? [entryPath] : [];
    }),
  );
  return files.flat().sort();
}

function isDocumentSurface(filePath: string): boolean {
  return (
    filePath === "README.md" ||
    filePath === "llms.txt" ||
    filePath === "llms-full.txt" ||
    (filePath.startsWith("docs/") && filePath.endsWith(".md") && !filePath.startsWith("docs/internal/"))
  );
}

function formatIssue(issue: ReturnType<typeof validateDocumentGraph>[number]): string {
  const location = issue.sourcePath ?? issue.target ?? "package";
  const target = issue.sourcePath === undefined || issue.target === undefined ? "" : ` (${issue.target})`;
  return `${location}: ${issue.code}${target}`;
}

export async function loadPackageDocumentation(options: LoadPackageOptions): Promise<PublicResource[]> {
  const packagePaths = await listFiles(options.rootPath);
  const sources = Object.fromEntries(
    await Promise.all(
      packagePaths.map(async (packagePath) => [
        packagePath,
        isDocumentSurface(packagePath) ? await readFile(path.join(options.rootPath, packagePath), "utf8") : "",
      ]),
    ),
  );
  const npmFiles = await readNpmPackInventory(options.rootPath, options.runCommand);
  const discoveredResources = discoverPublicResources(options.slug, packagePaths);
  const siteFiles = new Set([
    ...packagePaths.filter(
      (packagePath) =>
        packagePath.startsWith("docs/") && packagePath.endsWith(".md") && !packagePath.startsWith("docs/internal/"),
    ),
    ...discoveredResources.map(({ packagePath }) => packagePath),
  ]);
  const issues = validateDocumentGraph(createDocumentGraph(sources), { npmFiles, siteFiles });
  if (issues.length > 0) {
    throw new Error(`Invalid package documentation in ${options.rootPath}:\n${issues.map(formatIssue).join("\n")}`);
  }
  return discoveredResources.map((resource) => ({
    ...resource,
    rootPath: options.rootPath,
  }));
}

async function findManifestPaths(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (!entry.isDirectory() || entry.name === "node_modules") {
        return [];
      }
      const packagePath = path.join(rootPath, entry.name);
      const children = await readdir(packagePath, { withFileTypes: true });
      const ownManifest = children.some((child) => child.isFile() && child.name === "package.json")
        ? [path.join(packagePath, "package.json")]
        : [];
      return [...ownManifest, ...(await findManifestPaths(packagePath))];
    }),
  );
  return paths.flat();
}

export async function loadWorkspaceDocumentation(
  packagesRoot: string,
  loadPackage: PackageDocumentationLoader = loadPackageDocumentation,
): Promise<PublicResource[]> {
  const manifestPaths = await findManifestPaths(packagesRoot);
  const packages = await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
      const metadata = parsePackageMetadata(manifest, manifestPath);
      return metadata === null ? undefined : { rootPath: path.dirname(manifestPath), slug: metadata.slug };
    }),
  );
  const documentedPackages = packages
    .filter((entry) => entry !== undefined)
    .sort((left, right) => left.rootPath.localeCompare(right.rootPath));
  const results = await Promise.allSettled(documentedPackages.map((entry) => loadPackage(entry)));
  const failures = results.flatMap((result) =>
    result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
      : [],
  );
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}
