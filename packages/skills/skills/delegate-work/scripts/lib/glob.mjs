import fs from "node:fs";
import path from "node:path";

const WIN = process.platform === "win32";

export const toPosix = (p) => p.replace(/\\/g, "/");

export function globToRegex(glob) {
  const g = toPosix(glob).replace(/^\.\//, "");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        const slash = g[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, WIN ? "i" : "");
}

export function matchAny(file, globs) {
  const f = toPosix(file);
  return globs.some((g) => globToRegex(g).test(f));
}

export const rel = (root, p) => toPosix(path.relative(root, p));

/**
 * Long, resolved form of an existing path. On Windows, TEMP and os.tmpdir()
 * are often 8.3 short paths (C:\Users\GUSTAV~1.MOT) while git and harnesses
 * report long ones; comparing the two forms fails.
 */
export function canonical(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    // Missing (a file the worker deleted): resolve the nearest existing parent.
    const parent = path.dirname(p);
    return path.isAbsolute(p) && parent !== p ? path.join(canonical(parent), path.basename(p)) : p;
  }
}

/** canonical() applied to the literal directory prefix of a glob. */
export function canonicalGlob(glob) {
  const g = toPosix(glob);
  const wild = g.search(/[*?]/);
  const cut = wild < 0 ? g.length : g.lastIndexOf("/", wild);
  if (cut <= 0) {
    return g;
  }
  return toPosix(canonical(g.slice(0, cut))) + g.slice(cut);
}
