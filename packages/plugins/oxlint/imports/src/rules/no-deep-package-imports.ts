import fs from "fs";
import path from "path";

/**
 * Represents an AST node processed by ESLint.
 */
export interface ASTNode {
  type: string;
  source?: ASTNode | null;
  value?: unknown;
  [key: string]: unknown;
}

/**
 * The ESLint context provided to rules.
 */
export interface RuleContext {
  getFilename(): string;
  report(descriptor: { node: ASTNode; messageId: string; data?: Record<string, string> }): void;
}

/**
 * The module structure for an ESLint rule.
 */
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

/**
 * Cache for package information and workspace root path.
 */
export interface PackageCacheEntry {
  exports: unknown;
  packageJsonPath: string;
  mtime?: number;
}
export const packageCache = new Map<string, PackageCacheEntry | null>();
const workspaceRootCache = { value: "" };
let isWorkspaceScanned = false;
const wildcardRegexCache = new Map<string, RegExp>();

function parsePackageJson(pJsonPath: string): PackageCacheEntry | null {
  try {
    const stat = fs.statSync(pJsonPath);
    const content = fs.readFileSync(pJsonPath, "utf8");
    const pJson = JSON.parse(content);
    return {
      exports: pJson.exports,
      packageJsonPath: pJsonPath,
      mtime: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

function getCachedEntry(packageName: string): PackageCacheEntry | null | undefined {
  const cached = packageCache.get(packageName);
  if (cached === undefined) {
    return undefined;
  }
  if (cached === null) {
    return null;
  }
  try {
    if (fs.existsSync(cached.packageJsonPath)) {
      const stat = fs.statSync(cached.packageJsonPath);
      if (cached.mtime !== undefined && stat.mtimeMs !== cached.mtime) {
        const reloaded = parsePackageJson(cached.packageJsonPath);
        if (reloaded) {
          packageCache.set(packageName, reloaded);
          return reloaded;
        } else {
          packageCache.set(packageName, null);
          return null;
        }
      }
    }
  } catch {
    // Ignore errors to support mock/virtual paths in tests
  }
  return cached;
}

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
      let regex = wildcardRegexCache.get(key);
      if (!regex) {
        regex = new RegExp("^" + key.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "(.*)") + "$");
        wildcardRegexCache.set(key, regex);
      }
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
  const appsDir = path.join(workspaceRoot, "apps");

  const dirsToScan: string[] = [];

  const addSubdirs = (parentDir: string) => {
    if (!fs.existsSync(parentDir)) {
      return;
    }
    try {
      const children = fs.readdirSync(parentDir);
      for (const child of children) {
        const fullPath = path.join(parentDir, child);
        try {
          if (fs.statSync(fullPath).isDirectory()) {
            dirsToScan.push(fullPath);
          }
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }
  };

  addSubdirs(packagesDir);
  addSubdirs(appsDir);

  const pluginsDir = path.join(packagesDir, "plugins");
  if (fs.existsSync(pluginsDir)) {
    addSubdirs(pluginsDir);
    try {
      const pluginSubdirs = fs.readdirSync(pluginsDir);
      for (const sub of pluginSubdirs) {
        addSubdirs(path.join(pluginsDir, sub));
      }
    } catch {
      // Ignore
    }
  }

  for (const dir of dirsToScan) {
    const pJsonPath = path.join(dir, "package.json");
    if (fs.existsSync(pJsonPath)) {
      const entry = parsePackageJson(pJsonPath);
      if (entry) {
        try {
          const pJson = JSON.parse(fs.readFileSync(pJsonPath, "utf8"));
          if (pJson.name && pJson.name.startsWith("@codenhub/")) {
            packageCache.set(pJson.name, entry);
          }
        } catch {
          // Ignore
        }
      }
    }
  }
}

/**
 * Resolves the exports structure for a given @codenhub/ package.
 */
function getPackageInfo(packageName: string, currentFileDir: string): { exports: unknown } | null {
  const cached = getCachedEntry(packageName);
  if (cached !== undefined) {
    return cached;
  }

  const workspaceRoot = findWorkspaceRoot(currentFileDir);
  scanWorkspace(workspaceRoot);

  const cachedAfterScan = getCachedEntry(packageName);
  if (cachedAfterScan !== undefined) {
    return cachedAfterScan;
  }

  let dir = currentFileDir;
  while (dir && dir !== path.parse(dir).root) {
    const possiblePath = path.join(dir, "node_modules", packageName);
    const pJsonPath = path.join(possiblePath, "package.json");
    if (fs.existsSync(pJsonPath)) {
      const entry = parsePackageJson(pJsonPath);
      if (entry) {
        packageCache.set(packageName, entry);
        return entry;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
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

      const cleanImportPath = importPath.replace(/\/+$/, "");
      const match = cleanImportPath.match(/^(@codenhub\/[^/]+)(?:\/(.*))?$/);
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
