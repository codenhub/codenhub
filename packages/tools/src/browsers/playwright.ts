import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { CommandSpec } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";

const PLAYWRIGHT_PACKAGE = "@playwright/test";
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const BIN_DIRECTORY = join("node_modules", ".bin");
const MANIFEST_PATH = join("node_modules", "@playwright", "test", "package.json");
// Node refuses to spawn the POSIX shim on Windows, and `resolveInvocation` routes
// the command through the interpreter rather than letting `PATHEXT` pick.
const BIN_NAME = process.platform === "win32" ? "playwright.CMD" : "playwright";
const INSTALL_COMMAND = "install";

/**
 * Reports whether a package drives Playwright itself.
 *
 * Declaration is the signal rather than a `test:browser` script, because a
 * package that declares the runner needs its browsers even while the script is
 * still being written.
 * @param workspacePackage Package to inspect.
 * @returns `true` when the manifest declares `@playwright/test`.
 */
export function declaresPlaywright(workspacePackage: WorkspacePackage): boolean {
  return DEPENDENCY_FIELDS.some((field) => {
    const declared = workspacePackage.manifest[field];
    return typeof declared === "object" && declared !== null && PLAYWRIGHT_PACKAGE in declared;
  });
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function resolveBinary(directories: readonly string[]): Promise<string | undefined> {
  const candidates = directories.map((directory) => join(directory, BIN_DIRECTORY, BIN_NAME));
  const found = await Promise.all(candidates.map(async (candidate) => isFile(candidate)));
  return candidates.find((_, index) => found[index] === true);
}

/**
 * Reads the installed Playwright version for a package.
 *
 * The version is what browsers are cached by, and pnpm gives every package its
 * own launcher shim, so paths cannot tell two packages on one version apart.
 * @param directories Directories to look for an installed `@playwright/test` in, in order.
 * @returns Installed version, or `undefined` when no readable manifest was found.
 */
async function resolveVersion(directories: readonly string[]): Promise<string | undefined> {
  const contents = await Promise.all(
    directories.map(async (directory) => readFile(join(directory, MANIFEST_PATH), "utf8").catch(() => undefined)),
  );
  for (const content of contents) {
    if (content === undefined) {
      continue;
    }
    try {
      const version = (JSON.parse(content) as { version?: unknown }).version;
      if (typeof version === "string") {
        return version;
      }
    } catch {
      // An unreadable manifest only costs a redundant install, which is cheap.
    }
  }
  return undefined;
}

/**
 * Builds the browser installs the selected packages need.
 *
 * Browsers are cached per Playwright version outside the repository, so one
 * install covers every package on that version. Packages are therefore grouped by
 * the version they resolve to, and a package whose version is already covered adds
 * no second download. The install is left to Playwright rather than guarded by a
 * marker file: it verifies its own cache in well under a second, and a marker
 * would claim browsers are present after someone cleared that cache.
 * @param root Absolute repository root, used as the fallback CLI location.
 * @param packages Packages the command selected.
 * @param args Extra arguments for `playwright install`, such as `--with-deps`.
 * @returns One install per distinct Playwright version, in selection order.
 * @throws When a package declares Playwright but no CLI is installed for it.
 */
export async function planBrowserInstalls(
  root: string,
  packages: readonly WorkspacePackage[],
  args: readonly string[] = [],
): Promise<CommandSpec[]> {
  const candidates = packages.filter(declaresPlaywright);
  const resolved = await Promise.all(
    candidates.map(async (workspacePackage) => {
      const directories = [workspacePackage.directory, root];
      return { binary: await resolveBinary(directories), version: await resolveVersion(directories) };
    }),
  );
  const specs: CommandSpec[] = [];
  const seen = new Set<string>();

  for (const [index, workspacePackage] of candidates.entries()) {
    const { binary, version } = resolved[index] as { binary?: string; version?: string };
    if (binary === undefined) {
      throw new Error(
        `${workspacePackage.name} declares ${PLAYWRIGHT_PACKAGE} but no Playwright CLI is installed for it. Run \`pnpm install\` first.`,
      );
    }
    // An unknown version falls back to the launcher path, which at worst plans a
    // redundant install rather than skipping a browser a package actually needs.
    const key = version ?? binary;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    specs.push({ args: [INSTALL_COMMAND, ...args], command: binary, cwd: workspacePackage.directory });
  }
  return specs;
}
