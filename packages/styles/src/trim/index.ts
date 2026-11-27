import type { Utilities } from "./generate";
/* What `chs build` and the Vite plugin share, so for the same classes both
   write the same bytes. */
import { readPackageFile } from "./package";
import type { ClassSet } from "./purge";

export { findClasses, HEAD_BYTES, isPackageCopy, WRITTEN_HEAD } from "./classes";
export {
  findPackageRoot,
  readAestheticNames,
  readManifest,
  readPackageFile,
  readShippedSizes,
  resolveExport,
} from "./package";
export { generate, readUtilities } from "./generate";
export type { Utilities } from "./generate";
export { format, parse, purge, serialize } from "./purge";
export type { ClassSet, Node } from "./purge";
export { createTemporary, replaceFile, systemReason } from "./write";

// The package's `engines` floor, checked at run time because an older Node.js installs the package without complaint.
export const MIN_NODE_MAJOR = 24;
/* What `scripts/build-purge.mjs` writes: the complete stylesheet with the
   variants the command offers, and the class names it may drop from one. */
export const PURGE_SOURCE = "dist/purge/index.css";
const PURGE_CLASSES = "dist/purge/classes.json";

export async function readDroppable(): Promise<Set<string>> {
  return new Set(JSON.parse(await readPackageFile(PURGE_CLASSES)) as string[]);
}

/* The words worth keeping from a project's files: the classes the purge may
   drop, and the utilities the generator writes. */
export function knownClasses(droppable: ReadonlySet<string>, utilities: Utilities): Set<string> {
  return new Set([...droppable, ...utilities.names]);
}

// A class the purge may not drop is one no template has to name, such as `.theme-dark`, so it always counts as used.
export function usedClasses(found: ReadonlySet<string>, droppable: ReadonlySet<string>): ClassSet {
  return { has: (name: string) => found.has(name) || !droppable.has(name) };
}
