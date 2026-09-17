import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const WORKSPACE_MANIFEST = "pnpm-workspace.yaml";

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

/**
 * Walks up from a directory to the repository root.
 *
 * The root is identified by the pnpm workspace manifest so callers behave the
 * same from any package directory, including a package's own generator
 * script running with no `hub`-resolved workspace to hand it.
 * @param startDirectory Directory to start searching from.
 * @returns Absolute repository root.
 * @throws When no workspace manifest exists in any parent directory.
 */
export async function findWorkspaceRoot(startDirectory: string): Promise<string> {
  async function search(directory: string): Promise<string> {
    if (await isFile(resolve(directory, WORKSPACE_MANIFEST))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`Could not find ${WORKSPACE_MANIFEST} in ${startDirectory} or any parent directory.`);
    }
    return search(parent);
  }
  return search(resolve(startDirectory));
}
