import { stat } from "node:fs/promises";
import { join } from "node:path";

import type { CommandSpec } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { declaresAssets } from "./sync.ts";

const BIN_DIRECTORY = join("node_modules", ".bin");
// Node refuses to spawn the POSIX shim on Windows; see execute.ts's own note on
// the same issue for `playwright.CMD`.
const BIN_NAME = process.platform === "win32" ? "hub.CMD" : "hub";

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

/**
 * Builds the asset syncs the selected packages need before `build` or `dev` runs.
 *
 * Each sync re-invokes `hub assets <package>` rather than duplicating
 * {@link syncPackageAssets} as an in-process step: `prepare` only accepts
 * {@link CommandSpec}s, and going through the same command `pnpm hub assets` runs
 * keeps one implementation instead of two.
 * @param root Absolute repository root.
 * @param packages Packages the command selected.
 * @returns One `hub assets` invocation per package that declares `codenhub.assets`.
 * @throws When no `hub` binary is installed at the workspace root.
 */
export async function planAssetSyncs(root: string, packages: readonly WorkspacePackage[]): Promise<CommandSpec[]> {
  const candidates = packages.filter(declaresAssets);
  if (candidates.length === 0) {
    return [];
  }

  const binary = join(root, BIN_DIRECTORY, BIN_NAME);
  if (!(await isFile(binary))) {
    throw new Error(`Could not find the \`hub\` binary at ${binary}. Run \`pnpm install\` first.`);
  }

  return candidates.map((workspacePackage) => ({
    args: ["assets", workspacePackage.name],
    command: binary,
    cwd: root,
  }));
}
