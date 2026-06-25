import fs from "fs";
import path from "path";

export interface ASTNode {
  type: string;
  source?: ASTNode | null;
  value?: unknown;
  [key: string]: unknown;
}

export interface RuleContext {
  getFilename(): string;
  report(descriptor: { node: ASTNode; messageId: string; data?: Record<string, string> }): void;
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

// Cache for package information and workspace root path
export const packageCache = new Map<string, { exports: unknown; packageJsonPath: string } | null>();
const workspaceRootCache = { value: "" };
let isWorkspaceScanned = false;

/**
 * Normalizes and checks if a subpath is explicitly allowed in the package's exports map.
 */
function isSubpathAllowed(exports: unknown, subpath: string): boolean {
  if (typeof exports === "string") {
    return subpath === ".";
  }

  if (typeof exports !== "object" || exports === null) {
    return false;
  }

  const keys = Object.keys(exports as Record<string, unknown>);
  const isConditionalRoot = keys.every((key) => !key.startsWith("."));

  if (isConditionalRoot) {
    return subpath === ".";
  }

  for (const key of keys) {
    if (!key.startsWith(".")) {
      continue;
    }

    if (key === subpath) {
      return true;
    }

    if (key.includes("*")) {
      const regex = new RegExp("^" + key.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "(.*)") + "$");
      if (regex.test(subpath)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Finds the workspace root directory by looking for pnpm-workspace.yaml.
 */
function findWorkspaceRoot(startDir: string): string {
  if (workspaceRootCache.value) {
    return workspaceRootCache.value;
  }
  let dir = path.resolve(startDir);
  while (dir && dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      workspaceRootCache.value = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return process.cwd();
}

/**
 * Scans the workspace packages directory recursively for package.json files.
 */
function scanWorkspace(workspaceRoot: string) {
  if (isWorkspaceScanned) {
    return;
  }
  isWorkspaceScanned = true;

  const packagesDir = path.join(workspaceRoot, "packages");
  if (!fs.existsSync(packagesDir)) {
    return;
  }

  const visited = new Set<string>();

  function scan(dir: string) {
    let realPath: string;
    try {
      realPath = fs.realpathSync(dir);
    } catch {
      return;
    }
    if (visited.has(realPath)) {
      return;
    }
    visited.add(realPath);

    const name = path.basename(dir);
    if (name === "node_modules" || name === "dist" || name === "coverage" || name === ".git" || name === ".docs") {
      return;
    }

    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      return;
    }

    if (files.includes("package.json")) {
      const pJsonPath = path.join(dir, "package.json");
      try {
        const pJson = JSON.parse(fs.readFileSync(pJsonPath, "utf8"));
        if (pJson.name && pJson.name.startsWith("@codenhub/")) {
          packageCache.set(pJson.name, {
            exports: pJson.exports,
            packageJsonPath: pJsonPath,
          });
        }
      } catch {
        // Ignore invalid package.json
      }
    }

    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          scan(fullPath);
        }
      } catch {
        // Ignore stat errors
      }
    }
  }

  scan(packagesDir);
}

/**
 * Resolves the exports structure for a given @codenhub/ package.
 */
function getPackageInfo(packageName: string, currentFileDir: string): { exports: unknown } | null {
  if (packageCache.has(packageName)) {
    return packageCache.get(packageName)!;
  }

  const workspaceRoot = findWorkspaceRoot(currentFileDir);
  scanWorkspace(workspaceRoot);

  if (packageCache.has(packageName)) {
    return packageCache.get(packageName)!;
  }

  try {
    const mainPath = require.resolve(packageName, { paths: [currentFileDir] });
    let dir = path.dirname(mainPath);
    while (dir && dir !== path.parse(dir).root) {
      const pJsonPath = path.join(dir, "package.json");
      if (fs.existsSync(pJsonPath)) {
        const pJson = JSON.parse(fs.readFileSync(pJsonPath, "utf8"));
        if (pJson.name === packageName) {
          const info = { exports: pJson.exports, packageJsonPath: pJsonPath };
          packageCache.set(packageName, info);
          return info;
        }
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Ignore resolution errors
  }

  packageCache.set(packageName, null);
  return null;
}

/**
 * ESLint rule to prevent deep internal imports across package boundaries.
 */
export const noDeepPackageImports: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent deep internal imports across package boundaries unless exported explicitly",
      category: "Possible Errors",
      recommended: true,
    },
    schema: [],
    messages: {
      deepImportNotAllowed:
        "Deep import from package '{{packageName}}' is not allowed. Only exports defined in its package.json are allowed.",
    },
  },
  create(context): Record<string, (node: ASTNode) => void> {
    const filename = context.getFilename();
    const currentFileDir = filename && !filename.startsWith("<") ? path.dirname(filename) : process.cwd();

    function checkImport(importPath: string, reportNode: ASTNode) {
      if (!importPath.startsWith("@codenhub/")) {
        return;
      }

      const match = importPath.match(/^(@codenhub\/[^/]+)(?:\/(.*))?$/);
      if (!match) {
        return;
      }

      const packageName = match[1];
      const subpath = match[2];

      // Package root import (e.g. @codenhub/error) is always allowed.
      if (!subpath) {
        return;
      }

      const normalizedSubpath = `./${subpath}`;
      const info = getPackageInfo(packageName, currentFileDir);

      if (!info) {
        // If package cannot be resolved, block the deep import since it cannot be verified.
        context.report({
          node: reportNode,
          messageId: "deepImportNotAllowed",
          data: {
            packageName,
            importPath,
          },
        });
        return;
      }

      if (!info.exports) {
        // No exports map defined in package.json, so only root is allowed.
        context.report({
          node: reportNode,
          messageId: "deepImportNotAllowed",
          data: {
            packageName,
            importPath,
          },
        });
        return;
      }

      if (!isSubpathAllowed(info.exports, normalizedSubpath)) {
        context.report({
          node: reportNode,
          messageId: "deepImportNotAllowed",
          data: {
            packageName,
            importPath,
          },
        });
      }
    }

    return {
      ImportDeclaration(node: ASTNode) {
        if (node.source && typeof node.source.value === "string") {
          checkImport(node.source.value, node.source);
        }
      },
      ImportExpression(node: ASTNode) {
        if (node.source && node.source.type === "Literal" && typeof node.source.value === "string") {
          checkImport(node.source.value, node.source);
        }
      },
      ExportNamedDeclaration(node: ASTNode) {
        if (node.source && typeof node.source.value === "string") {
          checkImport(node.source.value, node.source);
        }
      },
      ExportAllDeclaration(node: ASTNode) {
        if (node.source && typeof node.source.value === "string") {
          checkImport(node.source.value, node.source);
        }
      },
    };
  },
};
