import { readdir, readFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import {
  createDocumentGraph,
  isValidationSurface,
  validateDocumentGraph,
  type ValidationIssue,
} from "./document-graph.ts";
import { readNpmPackInventory, type CommandRunner } from "./pack-inventory.ts";
import { parsePackageMetadata } from "./package-metadata.ts";
import { discoverPublicResources, type DiscoveredResource, type PublicResource } from "./public-resources.ts";

/** How one package's documentation should be inspected. */
export interface InspectPackageOptions {
  /** Absolute package directory. */
  rootPath: string;
  /** Package documentation slug. */
  slug: string;
  /**
   * Whether `npm pack --dry-run --json` runs to check tarball publication.
   *
   * It is opt-in because it is the slowest part of the inspection.
   */
  includeNpmInventory?: boolean;
  /** Command runner used for the pack inventory, injected by tests. */
  runCommand?: CommandRunner;
}

/** Everything an inspection learned about one package's documentation. */
export interface PackageDocumentationReport {
  /** Every problem found, in discovery order. */
  issues: ValidationIssue[];
  /** Non-Markdown files published alongside the documentation pages. */
  resources: DiscoveredResource[];
  /** Every package-relative file path. */
  files: string[];
}

async function listFiles(rootPath: string, relativePath = ""): Promise<string[]> {
  const entries = await readdir(join(rootPath, relativePath), { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = posix.join(relativePath.replaceAll("\\", "/"), entry.name);
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

/**
 * Validates one package's documentation surfaces, links, and publication.
 *
 * Problems are returned rather than thrown so callers can report every package
 * in one pass.
 * @param options Package location, slug, and inventory behavior.
 * @returns Issues, publishable resources, and the package file list.
 */
export async function inspectPackageDocumentation(options: InspectPackageOptions): Promise<PackageDocumentationReport> {
  const files = await listFiles(options.rootPath);
  const sources = Object.fromEntries(
    await Promise.all(
      files.map(async (packagePath) => [
        packagePath,
        isValidationSurface(packagePath) ? await readFile(join(options.rootPath, packagePath), "utf8") : "",
      ]),
    ),
  );

  let resources: DiscoveredResource[] = [];
  const issues: ValidationIssue[] = [];
  try {
    resources = discoverPublicResources(options.slug, files);
  } catch (cause) {
    issues.push({ code: "site-unpublished-target", message: (cause as Error).message });
  }

  const npmFiles =
    options.includeNpmInventory === true ? await readNpmPackInventory(options.rootPath, options.runCommand) : undefined;
  const siteFiles = new Set([
    ...files.filter(
      (packagePath) =>
        packagePath.startsWith("docs/") && packagePath.endsWith(".md") && !packagePath.startsWith("docs/internal/"),
    ),
    ...resources.map(({ packagePath }) => packagePath),
  ]);

  issues.push(...validateDocumentGraph(createDocumentGraph(sources), { npmFiles, siteFiles }));
  return { files, issues, resources };
}

function formatIssue(issue: ValidationIssue): string {
  const location = issue.sourcePath ?? issue.target ?? "package";
  const target = issue.sourcePath === undefined || issue.target === undefined ? "" : ` (${issue.target})`;
  return `${location}: ${issue.code}${target}`;
}

/**
 * Loads the publishable resources of one package, failing on any documentation problem.
 * @param options Package location, slug, and inventory behavior.
 * @returns Resources bound to the package directory.
 * @throws When the package has any documentation problem.
 */
export async function loadPackageDocumentation(options: InspectPackageOptions): Promise<PublicResource[]> {
  const report = await inspectPackageDocumentation(options);
  if (report.issues.length > 0) {
    throw new Error(
      `Invalid package documentation in ${options.rootPath}:\n${report.issues.map(formatIssue).join("\n")}`,
    );
  }
  return report.resources.map((resource) => ({ ...resource, rootPath: options.rootPath }));
}

async function findManifestPaths(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (!entry.isDirectory() || entry.name === "node_modules") {
        return [];
      }
      const packagePath = join(rootPath, entry.name);
      const children = await readdir(packagePath, { withFileTypes: true });
      const ownManifest = children.some((child) => child.isFile() && child.name === "package.json")
        ? [join(packagePath, "package.json")]
        : [];
      return [...ownManifest, ...(await findManifestPaths(packagePath))];
    }),
  );
  return paths.flat();
}

/** Loads one documented package, injected by tests. */
export type PackageDocumentationLoader = (options: InspectPackageOptions) => Promise<PublicResource[]>;

/**
 * Loads the publishable resources of every documented package under a directory.
 * @param packagesRoot Directory containing workspace packages.
 * @param loadPackage Loader used per package, defaulting to {@link loadPackageDocumentation}.
 * @returns Resources for every documented package.
 * @throws When any package has a documentation problem, reporting all of them.
 */
export async function loadWorkspaceDocumentation(
  packagesRoot: string,
  loadPackage: PackageDocumentationLoader = loadPackageDocumentation,
): Promise<PublicResource[]> {
  const manifestPaths = await findManifestPaths(packagesRoot);
  const packages = await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
      const metadata = parsePackageMetadata(manifest, manifestPath);
      return metadata === null ? undefined : { rootPath: dirname(manifestPath), slug: metadata.slug };
    }),
  );
  const documentedPackages = packages
    .filter((entry) => entry !== undefined)
    .sort((left, right) => left.rootPath.localeCompare(right.rootPath));
  const results = await Promise.allSettled(
    documentedPackages.map((entry) => loadPackage({ ...entry, includeNpmInventory: true })),
  );
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
