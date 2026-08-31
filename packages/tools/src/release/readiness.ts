import { execute } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";

/** Whether one publish precondition is met. */
export type ReadinessStatus = "ready" | "blocked" | "unknown";

/** One publish precondition and what was found. */
export interface ReadinessCheck {
  /** Stable identifier, such as `version`. */
  name: string;
  /** Whether the package may be published as far as this check can tell. */
  status: ReadinessStatus;
  /** What was found, in one line. */
  detail: string;
}

/** Runs a command and returns its outcome. Injected by tests. */
export type ReleaseRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<{ isSuccess: boolean; stdout: string }>;

const runCommand: ReleaseRunner = async (command, args, cwd) => {
  const outcome = await execute({ args, command, cwd }, { stdio: "pipe" });
  return { isSuccess: outcome.isSuccess, stdout: outcome.stdout ?? "" };
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function comparePreRelease(left: readonly string[], right: readonly string[]): number {
  // A version with a pre-release tag sorts below the same version without one.
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
  }
  for (const [index, leftPart] of left.entries()) {
    const rightPart = right[index];
    if (rightPart === undefined) {
      return 1;
    }
    if (leftPart !== rightPart) {
      const asNumbers = [Number(leftPart), Number(rightPart)];
      const numeric = asNumbers.every((value) => Number.isInteger(value));
      return numeric ? ((asNumbers[0] as number) < (asNumbers[1] as number) ? -1 : 1) : leftPart < rightPart ? -1 : 1;
    }
  }
  return left.length === right.length ? 0 : -1;
}

/**
 * Orders two semantic versions.
 *
 * Only the ordering a release gate needs is implemented: numeric release parts,
 * then dot-separated pre-release identifiers, with build metadata ignored.
 * @param left Version to compare.
 * @param right Version to compare against.
 * @returns Negative when `left` is older, positive when newer, zero when equal.
 */
export function compareVersions(left: string, right: string): number {
  const parse = (version: string): { release: number[]; pre: string[] } => {
    const [core = ""] = version.split("+");
    const [release = "", ...pre] = core.split("-");
    return { pre: pre.join("-") === "" ? [] : pre.join("-").split("."), release: release.split(".").map(Number) };
  };
  const [first, second] = [parse(left), parse(right)];
  for (let index = 0; index < Math.max(first.release.length, second.release.length); index += 1) {
    const [leftPart, rightPart] = [first.release[index] ?? 0, second.release[index] ?? 0];
    if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }
  return comparePreRelease(first.pre, second.pre);
}

/**
 * Lists the published targets a package's entry points point at.
 *
 * A target is normally a package-relative POSIX path. It may also be an
 * `exports` subpath pattern carrying a single `*`, which {@link checkTarball}
 * matches against the tarball rather than looking up literally.
 * @param manifest Parsed package manifest.
 * @returns Targets as written in the manifest, without duplicates.
 */
export function listEntryTargets(manifest: Readonly<Record<string, unknown>>): string[] {
  const found: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string" && value.startsWith("./")) {
      found.push(value.slice(2));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        collect(item);
      }
    } else if (typeof value === "object" && value !== null) {
      for (const item of Object.values(value)) {
        collect(item);
      }
    }
  };
  collect(manifest.exports);
  collect(manifest.main);
  collect(manifest.module);
  collect(manifest.types);
  return [...new Set(found)];
}

async function checkVersion(workspacePackage: WorkspacePackage, run: ReleaseRunner): Promise<ReadinessCheck> {
  const local = workspacePackage.manifest.version;
  if (typeof local !== "string") {
    return { detail: `no "version" in the manifest`, name: "version", status: "blocked" };
  }
  const result = await run("npm", ["view", workspacePackage.name, "version", "--json"], workspacePackage.directory);
  if (!result.isSuccess) {
    // An unpublished name is the common reason `npm view` fails, and it is not a
    // problem: the first release has nothing to be newer than.
    return { detail: `${local} would be the first published version`, name: "version", status: "ready" };
  }
  const published = (JSON.parse(result.stdout || '""') as string) || "";
  if (published === "") {
    return { detail: `${local} would be the first published version`, name: "version", status: "ready" };
  }
  if (compareVersions(local, published) > 0) {
    return { detail: `${local} is newer than the published ${published}`, name: "version", status: "ready" };
  }
  return {
    detail: `${local} is not newer than the published ${published}`,
    name: "version",
    status: "blocked",
  };
}

async function checkWorkingTree(workspacePackage: WorkspacePackage, run: ReleaseRunner): Promise<ReadinessCheck> {
  // The pathspec is resolved against the command's working directory, which is
  // the package directory itself, so it must be `.` — passing the repo-relative
  // location here would look for it nested under the package and silently match
  // nothing, reporting every tree as clean.
  const result = await run("git", ["status", "--porcelain", "--", "."], workspacePackage.directory);
  if (!result.isSuccess) {
    return { detail: "git could not report the working tree", name: "worktree", status: "unknown" };
  }
  const changed = result.stdout.split(/\r?\n/).filter((line) => line.trim() !== "");
  return changed.length === 0
    ? { detail: "no uncommitted changes", name: "worktree", status: "ready" }
    : {
        detail: `${changed.length} uncommitted change(s); the tarball would not match any commit`,
        name: "worktree",
        status: "blocked",
      };
}

/** Lists the files npm would publish for a package. Injected by tests. */
export type PackReader = (packageRoot: string, timeoutMs?: number) => Promise<Set<string>>;

const readPack: PackReader = async (packageRoot, timeoutMs) => {
  // npm pack is the slowest part of a preflight, and every other check can run
  // without the Markdown-aware module this shares with the documentation checks.
  const { readNpmPackInventory } = await import("../documentation/pack-inventory.ts");
  return readNpmPackInventory({ packageRoot, timeoutMs });
};

/**
 * Whether the tarball carries a file for one entry target.
 *
 * A plain target has to be present by name. A wildcard target — an `exports`
 * subpath pattern such as `dist/data/*.js` — is met when at least one packed
 * file matches the pattern, because that is all a consumer resolving the
 * subpath can rely on.
 * @param target Entry target from {@link listEntryTargets}.
 * @param packed Package-relative POSIX paths in the tarball.
 * @returns True when the target resolves to a packed file.
 */
function isEntryTargetPacked(target: string, packed: ReadonlySet<string>): boolean {
  if (!target.includes("*")) {
    return packed.has(target);
  }
  const pattern = new RegExp(`^${target.split("*").map(escapeRegExp).join(".+")}$`);
  return [...packed].some((file) => pattern.test(file));
}

async function checkTarball(
  workspacePackage: WorkspacePackage,
  read: PackReader,
  timeoutMs?: number,
): Promise<ReadinessCheck> {
  let packed: Set<string>;
  try {
    packed = await read(workspacePackage.directory, timeoutMs);
  } catch (cause) {
    return { detail: (cause as Error).message, name: "tarball", status: "unknown" };
  }
  const missing = listEntryTargets(workspacePackage.manifest).filter((target) => !isEntryTargetPacked(target, packed));
  return missing.length === 0
    ? { detail: `${packed.size} file(s), every entry point included`, name: "tarball", status: "ready" }
    : { detail: `missing from the tarball: ${missing.join(", ")}`, name: "tarball", status: "blocked" };
}

/** Everything a preflight learned about one package. */
export interface PackageReadiness {
  /** Package that was inspected. */
  workspacePackage: WorkspacePackage;
  /** Every precondition, in reporting order. */
  checks: ReadinessCheck[];
}

/** How a preflight should gather its evidence. */
export interface ReadinessOptions {
  /** Command runner, defaulting to real child processes. */
  run?: ReleaseRunner;
  /** Tarball reader, defaulting to `npm pack --dry-run`. */
  readPack?: PackReader;
  /** Milliseconds before npm is killed, or `undefined` to wait indefinitely. */
  timeoutMs?: number;
}

/**
 * Reports whether one package could be published as it stands.
 *
 * Nothing here writes, tags, or publishes. The preconditions are the ones a
 * build and a test run cannot answer: what the registry already has, whether the
 * tarball carries what the manifest promises, and whether the source on disk is
 * the source in a commit.
 * @param workspacePackage Package to inspect.
 * @param options Runners and timeout, injected by tests.
 * @returns Preconditions and their outcomes.
 */
export async function readPackageReadiness(
  workspacePackage: WorkspacePackage,
  options: ReadinessOptions = {},
): Promise<PackageReadiness> {
  const run = options.run ?? runCommand;
  const checks = await Promise.all([
    checkVersion(workspacePackage, run),
    checkWorkingTree(workspacePackage, run),
    checkTarball(workspacePackage, options.readPack ?? readPack, options.timeoutMs),
  ]);
  return { checks, workspacePackage };
}
