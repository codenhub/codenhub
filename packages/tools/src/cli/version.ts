import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Reads the version of the `@codenhub/tools` package.
 *
 * The manifest is read at run time rather than inlined at build time because the
 * CLI has no build step: it runs straight from source, so a constant would drift
 * from the manifest the moment either one changed alone.
 * @param moduleDirectory Directory of the calling module. Defaults to this file's.
 * @returns Declared version string.
 * @throws When the manifest is unreadable or declares no version.
 */
export async function readToolVersion(moduleDirectory: string = import.meta.dirname): Promise<string> {
  const manifestPath = resolve(moduleDirectory, "../../package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string") {
    throw new Error(`Invalid tooling manifest at ${manifestPath}: missing a "version" string.`);
  }
  return manifest.version;
}
