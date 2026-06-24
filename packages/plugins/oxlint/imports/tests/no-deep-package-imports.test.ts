import { describe, it, expect, beforeEach } from "vitest";

import { noDeepPackageImports, packageCache } from "../src/rules/no-deep-package-imports";

function setParents(node: any, parent?: any) {
  if (!node || typeof node !== "object") {return;}
  if ("type" in node && parent) {
    node.parent = parent;
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") {continue;}
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        setParents(child, "type" in node ? node : parent);
      }
    } else if (val && typeof val === "object") {
      setParents(val, "type" in node ? node : parent);
    }
  }
}

function runRule(tree: any, filename = "test.ts") {
  setParents(tree);
  const reports: any[] = [];
  const context = {
    getFilename() {
      return filename;
    },
    report(options: any) {
      reports.push(options);
    },
  } as any;

  const visitors = noDeepPackageImports.create(context);

  function traverse(node: any) {
    if (!node || typeof node !== "object") {return;}
    if (node.type && (visitors as any)[node.type]) {
      (visitors as any)[node.type](node);
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") {continue;}
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          traverse(child);
        }
      } else if (val && typeof val === "object") {
        traverse(val);
      }
    }
  }

  traverse(tree);
  return reports;
}

describe("no-deep-package-imports ESLint rule", () => {
  beforeEach(() => {
    packageCache.clear();
  });

  it("should ignore non-@codenhub imports", () => {
    const tree = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { type: "Literal", value: "react" },
        },
        {
          type: "ImportDeclaration",
          source: { type: "Literal", value: "lodash/map" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should allow root @codenhub imports", () => {
    const tree = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { type: "Literal", value: "@codenhub/error" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should allow deep imports if explicitly exported (exact match)", () => {
    packageCache.set("@codenhub/error", {
      exports: {
        ".": "./dist/index.js",
        "./registries": "./dist/registries/index.js",
      },
      packageJsonPath: "/mock/packages/error/package.json",
    });

    const tree = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { type: "Literal", value: "@codenhub/error/registries" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should allow deep imports if explicitly exported (wildcard match)", () => {
    packageCache.set("@codenhub/mock", {
      exports: {
        "./features/*": "./dist/features/*.js",
      },
      packageJsonPath: "/mock/packages/mock/package.json",
    });

    const tree = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { type: "Literal", value: "@codenhub/mock/features/auth" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should report deep imports if not exported", () => {
    packageCache.set("@codenhub/error", {
      exports: {
        ".": "./dist/index.js",
        "./registries": "./dist/registries/index.js",
      },
      packageJsonPath: "/mock/packages/error/package.json",
    });

    const tree = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { type: "Literal", value: "@codenhub/error/src/foo" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe("deepImportNotAllowed");
    expect(reports[0].data.packageName).toBe("@codenhub/error");
  });

  it("should report deep imports if the package has no exports map", () => {
    packageCache.set("@codenhub/no-exports", {
      exports: null,
      packageJsonPath: "/mock/packages/no-exports/package.json",
    });

    const tree = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { type: "Literal", value: "@codenhub/no-exports/src/foo" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe("deepImportNotAllowed");
  });

  it("should report deep imports if the package does not exist", () => {
    // packageCache is clear, and we mock non-existent package
    const tree = {
      type: "Program",
      body: [
        {
          type: "ImportDeclaration",
          source: { type: "Literal", value: "@codenhub/non-existent/foo" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe("deepImportNotAllowed");
  });

  it("should handle dynamic import expressions", () => {
    packageCache.set("@codenhub/error", {
      exports: {
        ".": "./dist/index.js",
      },
      packageJsonPath: "/mock/packages/error/package.json",
    });

    const tree = {
      type: "Program",
      body: [
        {
          type: "ExpressionStatement",
          expression: {
            type: "ImportExpression",
            source: { type: "Literal", value: "@codenhub/error/src/foo" },
          },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe("deepImportNotAllowed");
  });

  it("should handle exports named declarations", () => {
    packageCache.set("@codenhub/error", {
      exports: {
        ".": "./dist/index.js",
      },
      packageJsonPath: "/mock/packages/error/package.json",
    });

    const tree = {
      type: "Program",
      body: [
        {
          type: "ExportNamedDeclaration",
          source: { type: "Literal", value: "@codenhub/error/src/foo" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe("deepImportNotAllowed");
  });

  it("should handle export all declarations", () => {
    packageCache.set("@codenhub/error", {
      exports: {
        ".": "./dist/index.js",
      },
      packageJsonPath: "/mock/packages/error/package.json",
    });

    const tree = {
      type: "Program",
      body: [
        {
          type: "ExportAllDeclaration",
          source: { type: "Literal", value: "@codenhub/error/src/foo" },
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe("deepImportNotAllowed");
  });
});
