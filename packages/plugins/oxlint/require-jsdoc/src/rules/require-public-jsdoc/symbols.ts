import fs from "node:fs";
import path from "node:path";

import { resolveImport } from "./resolution";

// Cache for public symbols per package directory
export const packageCache = new Map<string, Map<string, Set<string>>>();

/**
 * Parses and traces exports recursively starting from public entrypoints.
 * Returns a map of absolute file path to a set of public symbol names.
 */
export function getPublicSymbols(
  pkgDir: string,
  pkgJson: { exports?: unknown; main?: string; module?: string; types?: string },
): Map<string, Set<string>> {
  const normalizedPkgDir = path.normalize(pkgDir);
  if (packageCache.has(normalizedPkgDir)) {
    return packageCache.get(normalizedPkgDir)!;
  }

  const publicSymbols = new Map<string, Set<string>>();
  packageCache.set(normalizedPkgDir, publicSymbols);

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
    if (t.startsWith("dist/")) {
      t = "src/" + t.slice(5);
    }

    const baseWithoutExt = t.replace(/\.(d\.ts|js|mjs|cjs)$/, "");
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

    const content = fs.readFileSync(normPath, "utf8");
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

    // Match export { A, B } from './foo';
    const exportFromRegex = /export\s+(?:type\s+)?\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = exportFromRegex.exec(cleanContent)) !== null) {
      const specifiersStr = match[1];
      const source = match[2];

      const resolved = resolveImport(source, normPath);
      if (resolved) {
        const sourceExports = traceFile(resolved);
        const specifiers = specifiersStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const spec of specifiers) {
          const parts = spec.replace(/\btype\s+/, "").split(/\s+as\s+/);
          const localName = parts[0].trim();
          const exportName = parts[1] ? parts[1].trim() : localName;

          if (sourceExports.has(localName)) {
            exportedSymbols.add(exportName);
            addSymbol(resolved, localName);
          } else {
            exportedSymbols.add(exportName);
            addSymbol(resolved, localName);
          }
        }
      }
    }

    // Match export * from '...'
    const exportAllRegex = /export\s+\*\s*from\s*['"]([^'"]+)['"]/g;
    while ((match = exportAllRegex.exec(cleanContent)) !== null) {
      const source = match[1];
      const resolved = resolveImport(source, normPath);
      if (resolved) {
        const sourceExports = traceFile(resolved);
        for (const sym of sourceExports) {
          exportedSymbols.add(sym);
          addSymbol(resolved, sym);
        }
      }
    }

    // Match inline exports
    const inlineExportRegex =
      /export\s+(?:default\s+)?(?:async\s+)?(?:type|interface|class|function\*?|const|let|var|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((match = inlineExportRegex.exec(cleanContent)) !== null) {
      const name = match[1];
      exportedSymbols.add(name);
      addSymbol(normPath, name);
    }

    // Match export default Name
    const defaultExportRegex = /export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((match = defaultExportRegex.exec(cleanContent)) !== null) {
      const name = match[1];
      exportedSymbols.add("default");
      addSymbol(normPath, name);
    }

    // Match export { A, B } (local exports)
    const localExportRegex = /export\s+\{\s*([^}]+)\s*\}(?!\s*from)/g;
    while ((match = localExportRegex.exec(cleanContent)) !== null) {
      const specifiersStr = match[1];
      const specifiers = specifiersStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const spec of specifiers) {
        const parts = spec.replace(/\btype\s+/, "").split(/\s+as\s+/);
        const localName = parts[0].trim();
        const exportName = parts[1] ? parts[1].trim() : localName;
        exportedSymbols.add(exportName);
        addSymbol(normPath, localName);
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

  return publicSymbols;
}
