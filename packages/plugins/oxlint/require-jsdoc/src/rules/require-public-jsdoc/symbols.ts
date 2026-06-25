import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

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
    const sourceFile = ts.createSourceFile(normPath, content, ts.ScriptTarget.Latest, true);

    const localImports = new Map<string, { source: string; originalName: string }>();

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const source =
          statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
            ? statement.moduleSpecifier.text
            : null;
        if (source && statement.importClause) {
          if (statement.importClause.name) {
            localImports.set(statement.importClause.name.text, { source, originalName: "default" });
          }
          if (statement.importClause.namedBindings) {
            if (ts.isNamedImports(statement.importClause.namedBindings)) {
              for (const element of statement.importClause.namedBindings.elements) {
                const localName = element.name.text;
                const originalName = element.propertyName ? element.propertyName.text : localName;
                localImports.set(localName, { source, originalName });
              }
            } else if (ts.isNamespaceImport(statement.importClause.namedBindings)) {
              localImports.set(statement.importClause.namedBindings.name.text, { source, originalName: "*" });
            }
          }
        }
      }
    }

    function extractBindingNames(nameNode: ts.BindingName, names: string[]) {
      if (ts.isIdentifier(nameNode)) {
        names.push(nameNode.text);
      } else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
        for (const element of nameNode.elements) {
          if (ts.isBindingElement(element)) {
            extractBindingNames(element.name, names);
          }
        }
      }
    }

    for (const statement of sourceFile.statements) {
      if (ts.isExportDeclaration(statement)) {
        const source =
          statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
            ? statement.moduleSpecifier.text
            : null;
        const resolved = source ? resolveImport(source, normPath) : null;

        if (resolved) {
          traceFile(resolved);
        }

        if (statement.exportClause) {
          if (ts.isNamedExports(statement.exportClause)) {
            for (const element of statement.exportClause.elements) {
              const localName = element.propertyName ? element.propertyName.text : element.name.text;
              const exportName = element.name.text;
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
          } else if (ts.isNamespaceExport(statement.exportClause)) {
            const exportName = statement.exportClause.name.text;
            exportedSymbols.add(exportName);
          }
        } else if (resolved) {
          // export * from "./foo"
          const sourceExports = traceFile(resolved);
          for (const sym of sourceExports) {
            exportedSymbols.add(sym);
            addSymbol(resolved, sym);
          }
        }
      } else if (ts.isExportAssignment(statement)) {
        // export default expr
        exportedSymbols.add("default");
        if (ts.isIdentifier(statement.expression)) {
          const localName = statement.expression.text;
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
      } else {
        // Check inline declaration exports
        const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
        const hasExport = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        const hasDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

        if (hasExport) {
          if (hasDefault) {
            exportedSymbols.add("default");
            if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
              if (statement.name) {
                addSymbol(normPath, statement.name.text);
              }
            }
          } else {
            if (ts.isVariableStatement(statement)) {
              for (const decl of statement.declarationList.declarations) {
                const names: string[] = [];
                extractBindingNames(decl.name, names);
                for (const name of names) {
                  exportedSymbols.add(name);
                  addSymbol(normPath, name);
                }
              }
            } else if (
              ts.isFunctionDeclaration(statement) ||
              ts.isClassDeclaration(statement) ||
              ts.isInterfaceDeclaration(statement) ||
              ts.isTypeAliasDeclaration(statement) ||
              ts.isEnumDeclaration(statement) ||
              ts.isModuleDeclaration(statement)
            ) {
              if (statement.name) {
                const name = statement.name.text;
                exportedSymbols.add(name);
                addSymbol(normPath, name);
              }
            }
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

  return publicSymbols;
}
