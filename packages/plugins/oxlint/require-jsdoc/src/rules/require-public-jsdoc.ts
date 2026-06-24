import fs from "node:fs";
import path from "node:path";

export interface ASTNode {
  type: string;
  id?: ASTNode;
  name?: string;
  parent?: ASTNode;
  declaration?: ASTNode;
  declarations?: ASTNode[];
  properties?: ASTNode[];
  elements?: (ASTNode | null)[];
  key?: ASTNode;
  value?: ASTNode;
  argument?: ASTNode;
  left?: ASTNode;
  leadingComments?: { type: string; value: string }[];
  [key: string]: unknown;
}

export interface RuleContext {
  filename?: string;
  getFilename?(): string;
  report(descriptor: { node: ASTNode; messageId: string; data?: Record<string, string | number> }): void;
  sourceCode?: {
    getCommentsBefore(node: ASTNode): { type: string; value: string }[];
  };
}

export interface RuleModule {
  meta: {
    type: "problem" | "suggestion" | "layout";
    docs: {
      description: string;
      category?: string;
      recommended?: boolean;
      url?: string;
    };
    schema: unknown[];
    messages: Record<string, string>;
  };
  create(context: RuleContext): Record<string, (node: ASTNode) => void>;
}

// Cache for public symbols per package directory
const packageCache = new Map<string, Map<string, Set<string>>>();

/**
 * Resolves an import path to its actual source file on disk.
 */
function resolveImport(importPath: string, currentFile: string): string | null {
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
    let found = false;
    for (const ext of possibleExtensions) {
      const fullPath = path.resolve(normalizedPkgDir, baseWithoutExt + ext);
      if (fs.existsSync(fullPath)) {
        resolvedEntrypoints.add(path.normalize(fullPath));
        found = true;
        break;
      }
    }
    if (!found) {
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

/**
 * Finds the nearest package.json starting from the given path and moving upwards.
 */
function findPackageJson(
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

/**
 * Helper to get names declared by a node.
 */
function getDeclaredNames(node: ASTNode): string[] {
  if (!node) {
    return [];
  }
  switch (node.type) {
    case "FunctionDeclaration":
    case "TSDeclareFunction":
    case "ClassDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
    case "TSEnumDeclaration":
      return node.id && node.id.name ? [node.id.name] : [];
    case "VariableDeclaration":
      const names: string[] = [];
      if (node.declarations) {
        for (const decl of node.declarations) {
          if (!decl.id) {
            continue;
          }
          if (decl.id.type === "Identifier") {
            names.push((decl.id as { name: string }).name);
          } else {
            // Handle destructuring
            const extractIdentifiers = (pattern: unknown) => {
              if (!pattern) {
                return;
              }
              const p = pattern as ASTNode;
              if (p.type === "Identifier") {
                names.push(p.name || (p as { id?: { name: string } }).id?.name || "");
              } else if (p.type === "Property") {
                extractIdentifiers(p.value);
              } else if (p.type === "ObjectPattern") {
                if (p.properties) {
                  p.properties.forEach(extractIdentifiers);
                }
              } else if (p.type === "ArrayPattern") {
                if (p.elements) {
                  p.elements.forEach((el) => {
                    if (el) {
                      extractIdentifiers(el);
                    }
                  });
                }
              } else if (p.type === "AssignmentPattern") {
                extractIdentifiers(p.left);
              } else if (p.type === "RestElement") {
                extractIdentifiers(p.argument);
              }
            };
            extractIdentifiers(decl.id);
          }
        }
      }
      return names;
    default:
      return [];
  }
}

/**
 * Helper to retrieve comments immediately before the node or its export parent.
 */
function getCommentsBeforeWithParent(node: ASTNode, context: RuleContext): { type: string; value: string }[] {
  const sourceCode = context.sourceCode;
  let targetNode = node;
  if (
    node.parent &&
    (node.parent.type === "ExportNamedDeclaration" || node.parent.type === "ExportDefaultDeclaration")
  ) {
    targetNode = node.parent;
  }
  if (sourceCode && typeof sourceCode.getCommentsBefore === "function") {
    return sourceCode.getCommentsBefore(targetNode) || [];
  }
  return (targetNode.leadingComments as { type: string; value: string }[]) || [];
}

export const requirePublicJsdocRule: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce JSDoc comments for exported public declarations in entry points",
      category: "Possible Errors",
      recommended: true,
    },
    messages: {
      missingJSDoc: 'Public export "{{name}}" is missing a JSDoc comment.',
    },
    schema: [],
  },
  create(context): Record<string, (node: ASTNode) => void> {
    const filename = context.filename || (typeof context.getFilename === "function" ? context.getFilename() : "");
    if (!filename) {
      return {};
    }

    const absoluteFilename = path.resolve(filename);
    const pkgInfo = findPackageJson(absoluteFilename);
    if (!pkgInfo) {
      return {};
    }

    const { pkgDir, pkgJson } = pkgInfo;
    const publicSymbols = getPublicSymbols(pkgDir, pkgJson);
    const filePublicSymbols = publicSymbols.get(path.normalize(absoluteFilename));

    if (!filePublicSymbols || filePublicSymbols.size === 0) {
      return {};
    }

    function checkJSDoc(node: ASTNode, name: string) {
      const comments = getCommentsBeforeWithParent(node, context);

      const isInternal = comments.some((comment) => {
        return comment.value && comment.value.includes("@internal");
      });
      if (isInternal) {
        return;
      }

      let hasValidJSDoc = false;
      if (comments.length > 0) {
        const lastComment = comments[comments.length - 1];
        if (lastComment.type === "Block" && lastComment.value && lastComment.value.startsWith("*")) {
          hasValidJSDoc = true;
        }
      }

      if (!hasValidJSDoc) {
        context.report({
          node,
          messageId: "missingJSDoc",
          data: { name },
        });
      }
    }

    function checkDeclaration(node: ASTNode) {
      const isTopLevel =
        node.parent &&
        (node.parent.type === "Program" ||
          node.parent.type === "ExportNamedDeclaration" ||
          node.parent.type === "ExportDefaultDeclaration");
      if (!isTopLevel) {
        return;
      }

      const declaredNames = getDeclaredNames(node);
      for (const name of declaredNames) {
        if (
          filePublicSymbols!.has(name) ||
          (node.parent!.type === "ExportDefaultDeclaration" && filePublicSymbols!.has("default"))
        ) {
          checkJSDoc(node, name);
          break;
        }
      }
    }

    return {
      FunctionDeclaration: checkDeclaration,
      TSDeclareFunction: checkDeclaration,
      ClassDeclaration: checkDeclaration,
      TSTypeAliasDeclaration: checkDeclaration,
      TSInterfaceDeclaration: checkDeclaration,
      TSEnumDeclaration: checkDeclaration,
      VariableDeclaration: checkDeclaration,
      ExportDefaultDeclaration(node: ASTNode) {
        const decl = node.declaration;
        if (decl) {
          const isNamedDeclaration =
            decl.type === "FunctionDeclaration" ||
            decl.type === "TSDeclareFunction" ||
            decl.type === "ClassDeclaration" ||
            decl.type === "VariableDeclaration" ||
            decl.type === "TSTypeAliasDeclaration" ||
            decl.type === "TSInterfaceDeclaration" ||
            decl.type === "TSEnumDeclaration";
          if (isNamedDeclaration && decl.id) {
            return;
          }
        }
        if (filePublicSymbols!.has("default")) {
          checkJSDoc(node, "default");
        }
      },
    };
  },
};
