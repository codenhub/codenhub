import { execute } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";

/** A release tag split into the package it names and the version it releases. */
export interface ReleaseTag {
  /** Package name, such as `@codenhub/error`. */
  name: string;
  /** Version the tag releases, such as `0.3.0`. */
  version: string;
}

/**
 * Splits a release tag into the package name and version it carries.
 *
 * The format is `<package name>@<version>`, so a scoped name keeps its own
 * leading `@` and the separator is the last one rather than the first.
 * @param tag Tag as written, such as `@codenhub/error@0.3.0`.
 * @returns The package and version the tag names, or `undefined` when it is not a release tag.
 */
export function parseReleaseTag(tag: string): ReleaseTag | undefined {
  const separator = tag.lastIndexOf("@");
  if (separator <= 0) {
    return undefined;
  }
  const [name, version] = [tag.slice(0, separator), tag.slice(separator + 1)];
  return name === "" || version === "" ? undefined : { name, version };
}

/** Why a package cannot be published from a given tag. */
export type TagResolutionError =
  | { reason: "malformed"; detail: string }
  | { reason: "unknown-package"; detail: string }
  | { reason: "private"; detail: string }
  | { reason: "version-mismatch"; detail: string };

/**
 * Resolves a release tag to the workspace package it publishes.
 *
 * The version in the tag must equal the version in the manifest at the commit
 * the tag points at. That equality is the whole point of tag-triggered
 * publishing: the tag is what a maintainer authorizes, and the manifest is what
 * the registry records, so a run where they disagree is a run publishing
 * something nobody asked for.
 * @param tag Tag as written, such as `@codenhub/error@0.3.0`.
 * @param packages Discovered workspace packages.
 * @returns The package to publish, or why the tag does not name one.
 */
export function resolveTagTarget(
  tag: string,
  packages: readonly WorkspacePackage[],
): { package: WorkspacePackage } | TagResolutionError {
  const parsed = parseReleaseTag(tag);
  if (parsed === undefined) {
    return { detail: `"${tag}" is not a release tag; expected "<package name>@<version>"`, reason: "malformed" };
  }
  const found = packages.find(({ name }) => name === parsed.name);
  if (found === undefined) {
    return { detail: `no workspace package is named "${parsed.name}"`, reason: "unknown-package" };
  }
  if (found.isPrivate) {
    return { detail: `${found.name} is private and is never published`, reason: "private" };
  }
  const declared = found.manifest.version;
  if (declared !== parsed.version) {
    return {
      detail: `${found.name} declares ${String(declared)} but the tag releases ${parsed.version}`,
      reason: "version-mismatch",
    };
  }
  return { package: found };
}

/** Runs `npm publish` for one package. Injected by tests. */
export type PublishRunner = (
  workspacePackage: WorkspacePackage,
  timeoutMs?: number,
) => Promise<{ isSuccess: boolean; output: string }>;

/**
 * Publishes one package with npm.
 *
 * No `--provenance` flag is passed. Under npm trusted publishing the registry
 * generates a provenance attestation on its own, and the flag is rejected
 * outside a supported CI provider — passing it would buy nothing in the
 * workflow and break the same command on a maintainer's machine.
 * @param workspacePackage Package to publish.
 * @param timeoutMs Milliseconds before npm is killed, or `undefined` to wait indefinitely.
 * @returns Whether npm succeeded, with its combined output.
 */
export const runNpmPublish: PublishRunner = async (workspacePackage, timeoutMs) => {
  const outcome = await execute(
    { args: ["publish", "--access", "public"], command: "npm", cwd: workspacePackage.directory },
    { stdio: "pipe", timeoutMs },
  );
  return { isSuccess: outcome.isSuccess, output: outcome.output ?? "" };
};

/** Reads the version a registry currently serves for a package. Injected by tests. */
export type RegistryReader = (workspacePackage: WorkspacePackage, timeoutMs?: number) => Promise<string | undefined>;

/**
 * Reads back the version npm serves for a package.
 *
 * `docs/specs/packages-lifecycle.md` asks for this confirmation after every
 * publish. It is a report and never a gate: registry metadata propagates
 * eventually, so a version that has not appeared yet means "check again in a
 * moment", not "the publish failed".
 * @param workspacePackage Package to look up.
 * @param timeoutMs Milliseconds before npm is killed, or `undefined` to wait indefinitely.
 * @returns The published version, or `undefined` when the registry did not answer with one.
 */
export const readPublishedVersion: RegistryReader = async (workspacePackage, timeoutMs) => {
  const outcome = await execute(
    { args: ["view", workspacePackage.name, "version", "--json"], command: "npm", cwd: workspacePackage.directory },
    { stdio: "pipe", timeoutMs },
  );
  if (!outcome.isSuccess) {
    return undefined;
  }
  try {
    return (JSON.parse(outcome.stdout || '""') as string) || undefined;
  } catch {
    return undefined;
  }
};
