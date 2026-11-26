import { existsSync, readFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Manifest {
  version: string;
  exports: Record<string, unknown>;
}

/* `./aesthetics/tw` is the Tailwind source of every aesthetic, not an aesthetic
   named `tw`, which the path therefore rules out as a name. */
const AESTHETIC_EXPORT = /^\.\/aesthetics\/(?!tw$)([^/]+)$/;

/** Returns the nearest folder at or above `from` that holds a `package.json`. */
export function findPackageRoot(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    if (path.dirname(dir) === dir) {
      throw new Error(`cannot find the package.json of @codenhub/styles above ${from}.`);
    }
  }
}

/* This file runs as `src/trim/package.ts` in tests and bundled into `dist/cli.js`
   and `dist/vite.js` when installed, so the package root is found from it
   rather than by package name. */
const packageRoot = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as Manifest;
}

// Read from this package's own manifest, so the list follows its `exports` instead of drifting from them.
export function readAestheticNames(): string[] {
  const { exports } = readManifest();

  return Object.keys(exports)
    .map((subpath) => AESTHETIC_EXPORT.exec(subpath)?.[1])
    .filter((name) => name !== undefined)
    .sort();
}

// The file a subpath export names under the `import` condition, relative to the package root; every StyleKit export names the same file under `style`.
export function resolveExport(subpath: string): string {
  return (readManifest().exports[subpath] as { import: string }).import;
}

export function readPackageFile(relativePath: string): Promise<string> {
  return fs.readFile(path.resolve(packageRoot, relativePath), "utf8");
}

/* The files this package ships under `dist/`, by size, so a content file is
   compared with one only when the sizes agree. */
export async function readShippedSizes(): Promise<Map<number, string[]>> {
  const dist = path.join(packageRoot, "dist");
  const sizes = new Map<number, string[]>();
  const entries = await fs.readdir(dist, { recursive: true, withFileTypes: true });

  for (const entry of entries.filter((dirent) => dirent.isFile())) {
    const file = path.join(entry.parentPath, entry.name);
    // oxlint-disable-next-line no-await-in-loop -- a few dozen files at most
    const { size } = await fs.stat(file);

    sizes.set(size, [...(sizes.get(size) ?? []), file]);
  }

  return sizes;
}
