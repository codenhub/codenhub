import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { createPackageFiles, toLabel } from "../scaffold/package-template.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

const PACKAGES_DIRECTORY = "packages";
const DEFAULT_SCOPE = "@codenhub";
// The name becomes a directory, an npm package, and a documentation slug, and
// only the intersection of what all three accept is safe.
const PACKAGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readOption(passthrough: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return passthrough.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Picks the npm scope a new package should join.
 *
 * The workspace decides rather than a constant, so the scaffold follows a rename
 * of the organization instead of having to be updated alongside it.
 * @param packages Every workspace package.
 * @returns The most common scope, or the default when the workspace has none.
 */
export function resolveScope(packages: readonly WorkspacePackage[]): string {
  const counts = new Map<string, number>();
  for (const { name } of packages) {
    if (name.startsWith("@")) {
      const scope = name.slice(0, name.indexOf("/"));
      counts.set(scope, (counts.get(scope) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort(([left, leftCount], [right, rightCount]) =>
    leftCount === rightCount ? left.localeCompare(right) : rightCount - leftCount,
  );
  return ranked[0]?.[0] ?? DEFAULT_SCOPE;
}

interface Request {
  name: string;
  description: string;
  label: string;
}

function readRequest(context: CommandContext): Request | string {
  const name = context.tokens[0];
  if (name === undefined) {
    return "Usage: hub new <name> [--description=<text>] [--label=<text>]";
  }
  if (context.tokens.length > 1) {
    return `\`hub new\` creates one package at a time, but ${context.tokens.length} names were given.`;
  }
  if (!PACKAGE_NAME.test(name)) {
    return `Invalid package name "${name}": use lowercase words separated by single hyphens.`;
  }
  return {
    description: readOption(context.passthrough, "description") ?? `TODO: describe ${name}.`,
    label: readOption(context.passthrough, "label") ?? toLabel(name),
    name,
  };
}

/**
 * Compiles the new package's `llms-full.txt`.
 *
 * The file is generated rather than templated because it is derived from the
 * README and public docs, and a scaffold that wrote it by hand would be stale
 * before the author finished editing them.
 * @param root Absolute repository root.
 * @param location Repository-relative package location.
 */
async function generateLlmsFull(root: string, location: string): Promise<void> {
  // The generator pulls in a Markdown parser, which the rest of this command
  // can do without.
  const { buildLlmsFull, listLlmsFullSources } = await import("../documentation/llms-full.ts");
  const directory = resolve(root, location);
  const contents = await buildLlmsFull(directory, await listLlmsFullSources(directory));
  await writeFile(join(directory, "llms-full.txt"), contents, "utf8");
}

/**
 * Creates the command that scaffolds a new public package.
 *
 * A compliant package has to satisfy the lifecycle, documentation, and README
 * specs before `hub check` says anything useful about it, which is a long list
 * to assemble by hand and a tedious one to review. The scaffold writes the parts
 * that are the same every time and leaves the prose marked `TODO`.
 * @returns Command definition ready for registration.
 */
export function createNewCommand(): CommandDefinition {
  return {
    name: "new",
    run: async (context) => {
      const request = readRequest(context);
      if (typeof request === "string") {
        context.reporter.error(request);
        return EXIT_FAILURE;
      }

      const location = `${PACKAGES_DIRECTORY}/${request.name}`;
      const scope = resolveScope(context.workspace.packages);
      const fullName = `${scope}/${request.name}`;
      const taken = context.workspace.packages.find(
        (workspacePackage) => workspacePackage.name === fullName || workspacePackage.location === location,
      );
      if (taken !== undefined) {
        context.reporter.error(`${taken.name} already exists at ${taken.location}.`);
        return EXIT_FAILURE;
      }

      const files = createPackageFiles({ ...request, location, scope });
      if (context.options.isDryRun) {
        context.reporter.step(`Would create ${files.length + 1} file(s) in ${location}`);
        for (const file of [...files, { path: "llms-full.txt" }]) {
          context.reporter.detail(`  ${location}/${file.path}`);
        }
        return EXIT_SUCCESS;
      }

      const directory = resolve(context.workspace.root, location);
      // `recursive` makes directory creation idempotent, but the package
      // directory itself must not already exist: a scaffold that overwrote a
      // package would destroy work no check could recover.
      await mkdir(dirname(directory), { recursive: true });
      await mkdir(directory, { recursive: false }).catch((cause: NodeJS.ErrnoException) => {
        throw cause.code === "EEXIST" ? new Error(`${location} already exists.`) : cause;
      });
      await Promise.all(
        files.map(async (file) => {
          const filePath = join(directory, file.path);
          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, file.contents, "utf8");
        }),
      );
      await generateLlmsFull(context.workspace.root, location);

      context.reporter.step(`Created ${fullName}`);
      for (const file of files) {
        context.reporter.detail(`  ${location}/${file.path}`);
      }
      context.reporter.detail(`  ${location}/llms-full.txt`);
      context.reporter.blank();
      context.reporter.info("Next:");
      context.reporter.detail("  pnpm install                       link the package into the workspace");
      context.reporter.detail(`  pnpm verify ${request.name.padEnd(22)} confirm it starts compliant`);
      context.reporter.detail(
        `  add ${location}/LICENSE${" ".repeat(Math.max(1, 18 - location.length))} the manifest already declares Apache-2.0`,
      );
      context.reporter.detail("  replace the TODO prose, then run pnpm generate");
      return EXIT_SUCCESS;
    },
    selectsPackages: false,
    summary: "Scaffold a new public package.",
    usage: "hub new <name> [--description=<text>] [--label=<text>] [--dry-run]",
  };
}
