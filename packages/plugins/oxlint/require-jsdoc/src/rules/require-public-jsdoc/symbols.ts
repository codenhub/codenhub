import fs from "node:fs";
import path from "node:path";

import { resolveImport } from "./resolution";

/**
 * Cache for public symbols per package directory.
 */
export const packageCache = new Map<
  string,
  {
    symbols: Map<string, Set<string>>;
    packageJsonPath: string;
    mtime: number;
    entrypoints: { path: string; mtime: number }[];
  }
>();

const DIST_DIR_PREFIX = "dist/";
const SRC_DIR_PREFIX = "src/";

function isCacheValid(cached: {
  packageJsonPath: string;
  mtime: number;
  entrypoints: { path: string; mtime: number }[];
}): boolean {
  try {
    const pkgStat = fs.statSync(cached.packageJsonPath);
    if (pkgStat.mtimeMs !== cached.mtime) {
      return false;
    }
    for (const ep of cached.entrypoints) {
      if (fs.existsSync(ep.path)) {
        const epStat = fs.statSync(ep.path);
        if (epStat.mtimeMs !== ep.mtime) {
          return false;
        }
      } else {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses and traces exports recursively starting from public entrypoints.
 * Returns a map of absolute file path to a set of public symbol names.
 */
export function getPublicSymbols(
  pkgDir: string,
  pkgJson: { exports?: unknown; main?: string; module?: string; types?: string },
): Map<string, Set<string>> {
  const normalizedPkgDir = path.normalize(pkgDir);
  const cached = packageCache.get(normalizedPkgDir);
  if (cached && isCacheValid(cached)) {
    return cached.symbols;
  }

  const publicSymbols = new Map<string, Set<string>>();
  const entrypointsList: { path: string; mtime: number }[] = [];

  const addSymbol = (filePath: string, symbol: string) => {
    const normPath = path.normalize(filePath);
    if (!publicSymbols.has(normPath)) {
      publicSymbols.set(normPath, new Set());
    }
    publicSymbols.get(normPath)!.add(symbol);
  };

  const entrypointPaths: string[] = [];

  const extractPaths = (obj: unknown) => {
    if (typeof obj === "string") {
      entrypointPaths.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(extractPaths);
    } else if (obj && typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        extractPaths(record[key]);
      }
    }
  };

  if (pkgJson.exports) {
    extractPaths(pkgJson.exports);
  } else {
    if (pkgJson.main) {
      entrypointPaths.push(pkgJson.main);
    }
    if (pkgJson.module) {
      entrypointPaths.push(pkgJson.module);
    }
    if (pkgJson.types) {
      entrypointPaths.push(pkgJson.types);
    }
  }

  const resolvedEntrypoints = new Set<string>();
  for (const ep of entrypointPaths) {
    let t = ep.replace(/\\/g, "/").replace(/^\.\//, "");
    if (t.startsWith(DIST_DIR_PREFIX)) {
      t = SRC_DIR_PREFIX + t.slice(DIST_DIR_PREFIX.length);
    }

    const baseWithoutExt = t.replace(/\.(d\.ts|ts|tsx|js|mjs|cjs)$/, "");
    const possibleExtensions = [".ts", ".tsx", ".js", ".jsx"];
    let isFound = false;
    for (const ext of possibleExtensions) {
      const fullPath = path.resolve(normalizedPkgDir, baseWithoutExt + ext);
      if (fs.existsSync(fullPath)) {
        resolvedEntrypoints.add(path.normalize(fullPath));
        isFound = true;
        break;
      }
    }
    if (!isFound) {
      const fullPath = path.resolve(normalizedPkgDir, t);
      if (fs.existsSync(fullPath)) {
        resolvedEntrypoints.add(path.normalize(fullPath));
      }
    }
  }

  const visited = new Set<string>();

  const traceFile = (filePath: string): Set<string> => {
    const normPath = path.normalize(filePath);
    if (visited.has(normPath)) {
      return new Set();
    }
    visited.add(normPath);

    const exportedSymbols = new Set<string>();

    if (!fs.existsSync(normPath)) {
      return exportedSymbols;
    }

    try {
      const stat = fs.statSync(normPath);
      entrypointsList.push({ path: normPath, mtime: stat.mtimeMs });
    } catch {
      // Ignore
    }

    const content = fs.readFileSync(normPath, "utf8");
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

    // 1. Parse imports
    const importRegex = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    const localImports = new Map<string, { source: string; originalName: string }>();
    let importMatch;
    while ((importMatch = importRegex.exec(cleanContent)) !== null) {
      let clause = importMatch[1].trim();
      const source = importMatch[2];

      if (clause.startsWith("type ")) {
        clause = clause.slice(5).trim();
      }

      if (/^[a-zA-Z0-9_$]+$/.test(clause)) {
        localImports.set(clause, { source, originalName: "default" });
      } else {
        const namedMatch = clause.match(/{([\s\S]*?)}/);
        if (namedMatch) {
          const elements = namedMatch[1].split(",");
          for (const el of elements) {
            let trimmed = el.trim();
            if (!trimmed) {
              continue;
            }
            if (trimmed.startsWith("type ")) {
              trimmed = trimmed.slice(5).trim();
            }
            const parts = trimmed.split(/\s+as\s+/);
            const originalName = parts[0].trim();
            const localName = parts[1] ? parts[1].trim() : originalName;
            localImports.set(localName, { source, originalName });
          }
        }
        const nsMatch = clause.match(/\*\s+as\s+([a-zA-Z0-9_$]+)/);
        if (nsMatch) {
          localImports.set(nsMatch[1], { source, originalName: "*" });
        }
      }
    }

    // 2. Parse exports
    // Matches: export * from "./foo";
    const exportStarRegex = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
    let starMatch;
    while ((starMatch = exportStarRegex.exec(cleanContent)) !== null) {
      const source = starMatch[1];
      const resolved = resolveImport(source, normPath);
      if (resolved) {
        const sourceExports = traceFile(resolved);
        for (const sym of sourceExports) {
          exportedSymbols.add(sym);
          addSymbol(resolved, sym);
        }
      }
    }

    // Matches: export { a, b as c } from "./foo"; OR export { a, b as c };
    const exportNamedRegex = /export\s+(?:type\s+)?{([\s\S]*?)}\s*(?:from\s+['"]([^'"]+)['"])?/g;
    let namedMatch;
    while ((namedMatch = exportNamedRegex.exec(cleanContent)) !== null) {
      const clause = namedMatch[1];
      const source = namedMatch[2];
      const resolved = source ? resolveImport(source, normPath) : null;
      if (resolved) {
        traceFile(resolved);
      }

      const elements = clause.split(",");
      for (const el of elements) {
        let trimmed = el.trim();
        if (!trimmed) {
          continue;
        }
        if (trimmed.startsWith("type ")) {
          trimmed = trimmed.slice(5).trim();
        }
        const parts = trimmed.split(/\s+as\s+/);
        const localName = parts[0].trim();
        const exportName = parts[1] ? parts[1].trim() : localName;
        exportedSymbols.add(exportName);

        if (resolved) {
          addSymbol(resolved, localName);
        } else {
          const imported = localImports.get(localName);
          if (imported) {
            const resolvedImport = resolveImport(imported.source, normPath);
            if (resolvedImport) {
              traceFile(resolvedImport);
              addSymbol(resolvedImport, imported.originalName);
            }
          } else {
            addSymbol(normPath, localName);
          }
        }
      }
    }

    // Matches: export default ...
    const exportDefaultRegex = /export\s+default\s+(?:class|function)?\s*([a-zA-Z0-9_$]+)?/g;
    let defaultMatch;
    while ((defaultMatch = exportDefaultRegex.exec(cleanContent)) !== null) {
      exportedSymbols.add("default");
      const localName = defaultMatch[1];
      if (localName) {
        const imported = localImports.get(localName);
        if (imported) {
          const resolvedImport = resolveImport(imported.source, normPath);
          if (resolvedImport) {
            traceFile(resolvedImport);
            addSymbol(resolvedImport, imported.originalName);
          }
        } else {
          addSymbol(normPath, localName);
        }
      }
    }

    // Matches: export const/let/var/function/class/interface/type/enum name
    const inlineExportRegex = /export\s+(const|let|var|function|class|interface|type|enum)\s+([a-zA-Z0-9_$]+)/g;
    let inlineMatch;
    while ((inlineMatch = inlineExportRegex.exec(cleanContent)) !== null) {
      const name = inlineMatch[2];
      exportedSymbols.add(name);
      addSymbol(normPath, name);
    }

    // Matches destructuring export: export const { a, b } = ... OR export const [ a, b ] = ...
    const destructureExportRegex = /export\s+(const|let|var)\s+([{\[])([\s\S]*?)([}\]])\s*=/g;
    let destructureMatch;
    while ((destructureMatch = destructureExportRegex.exec(cleanContent)) !== null) {
      const bindingBody = destructureMatch[3];
      const idMatches = bindingBody.match(/[a-zA-Z0-9_$]+/g);
      if (idMatches) {
        for (const name of idMatches) {
          const index = bindingBody.indexOf(name);
          const after = bindingBody.slice(index + name.length).trim();
          if (after.startsWith(":")) {
            const valMatch = after
              .slice(1)
              .trim()
              .match(/^[a-zA-Z0-9_$]+/);
            if (valMatch) {
              const valName = valMatch[0];
              exportedSymbols.add(valName);
              addSymbol(normPath, valName);
            }
          } else {
            exportedSymbols.add(name);
            addSymbol(normPath, name);
          }
        }
      }
    }

    return exportedSymbols;
  };

  for (const ep of resolvedEntrypoints) {
    const epExports = traceFile(ep);
    for (const sym of epExports) {
      addSymbol(ep, sym);
    }
  }

  const packageJsonPath = path.join(normalizedPkgDir, "package.json");
  let pkgMtime = 0;
  try {
    pkgMtime = fs.statSync(packageJsonPath).mtimeMs;
  } catch {
    // Ignore
  }

  packageCache.set(normalizedPkgDir, {
    symbols: publicSymbols,
    packageJsonPath,
    mtime: pkgMtime,
    entrypoints: entrypointsList,
  });

  return publicSymbols;
}
