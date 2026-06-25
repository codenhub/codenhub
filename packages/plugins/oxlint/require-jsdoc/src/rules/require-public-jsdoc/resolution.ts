import fs from "node:fs";
import path from "node:path";

/**
 * Resolves an import path to its actual source file on disk.
 */
export function resolveImport(importPath: string, currentFile: string): string | null {
  const dir = path.dirname(currentFile);
  const absoluteBase = path.resolve(dir, importPath);

  const extensions = [".ts", ".tsx", ".d.ts", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
  for (const ext of extensions) {
    const file = absoluteBase + ext;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return file;
    }
  }
  if (fs.existsSync(absoluteBase) && fs.statSync(absoluteBase).isFile()) {
    return absoluteBase;
  }
  return null;
}

/**
 * Finds the nearest package.json starting from the given path and moving upwards.
 */
export function findPackageJson(
  startFile: string,
): { pkgDir: string; pkgJson: { exports?: unknown; main?: string; module?: string; types?: string } } | null {
  let dir = path.dirname(path.resolve(startFile));
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        return { pkgDir: dir, pkgJson };
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}
