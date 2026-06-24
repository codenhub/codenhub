import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { requirePublicJsdocRule, type ASTNode } from "../src/rules/require-public-jsdoc.js";

describe("require-public-jsdoc rule", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eslint-plugin-require-jsdoc-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setupMockPackage(pkgJson: Record<string, unknown>, files: Record<string, string>) {
    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(pkgJson));
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
  }

  it("should skip file if it has no public exports", () => {
    setupMockPackage(
      {
        name: "test-pkg",
        exports: {
          ".": "./dist/index.js",
        },
      },
      {
        "src/index.ts": 'export { foo } from "./foo";',
        "src/foo.ts": "export const foo = 1;",
        "src/bar.ts": "export const bar = 2;",
      },
    );

    const context = {
      filename: path.join(tempDir, "src/bar.ts"),
      report: vi.fn(),
      sourceCode: {
        getCommentsBefore: vi.fn(() => []),
      },
    };

    const visitors = requirePublicJsdocRule.create(context);
    expect(visitors).toEqual({});
  });

  it("should report missing JSDoc for public exported function declaration", () => {
    setupMockPackage(
      {
        name: "test-pkg",
        exports: {
          ".": "./dist/index.js",
        },
      },
      {
        "src/index.ts": 'export { foo } from "./foo";',
        "src/foo.ts": "export function foo() {}",
      },
    );

    const reportSpy = vi.fn();
    const context = {
      filename: path.join(tempDir, "src/foo.ts"),
      report: reportSpy,
      sourceCode: {
        getCommentsBefore: vi.fn(() => []),
      },
    };

    const visitors = requirePublicJsdocRule.create(context);
    expect(visitors.FunctionDeclaration).toBeDefined();

    const mockNode: ASTNode = {
      type: "FunctionDeclaration",
      id: { type: "Identifier", name: "foo" },
      parent: { type: "ExportNamedDeclaration" },
    };

    visitors.FunctionDeclaration!(mockNode);

    expect(reportSpy).toHaveBeenCalledOnce();
    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        node: mockNode,
        messageId: "missingJSDoc",
        data: { name: "foo" },
      }),
    );
  });

  it("should pass if public export has JSDoc comment", () => {
    setupMockPackage(
      {
        name: "test-pkg",
        exports: {
          ".": "./dist/index.js",
        },
      },
      {
        "src/index.ts": 'export { foo } from "./foo";',
        "src/foo.ts": "export function foo() {}",
      },
    );

    const reportSpy = vi.fn();
    const mockComments = [
      {
        type: "Block",
        value: "*\n * This is a valid JSDoc comment.\n ",
      },
    ];

    const context = {
      filename: path.join(tempDir, "src/foo.ts"),
      report: reportSpy,
      sourceCode: {
        getCommentsBefore: vi.fn(() => mockComments),
      },
    };

    const visitors = requirePublicJsdocRule.create(context);
    const mockNode: ASTNode = {
      type: "FunctionDeclaration",
      id: { type: "Identifier", name: "foo" },
      parent: { type: "ExportNamedDeclaration" },
    };

    visitors.FunctionDeclaration!(mockNode);

    expect(reportSpy).not.toHaveBeenCalled();
  });

  it("should report if comment is block comment but not JSDoc (does not start with *)", () => {
    setupMockPackage(
      {
        name: "test-pkg",
        exports: {
          ".": "./dist/index.js",
        },
      },
      {
        "src/index.ts": 'export { foo } from "./foo";',
        "src/foo.ts": "export function foo() {}",
      },
    );

    const reportSpy = vi.fn();
    const mockComments = [
      {
        type: "Block",
        value: " Regular block comment ",
      },
    ];

    const context = {
      filename: path.join(tempDir, "src/foo.ts"),
      report: reportSpy,
      sourceCode: {
        getCommentsBefore: vi.fn(() => mockComments),
      },
    };

    const visitors = requirePublicJsdocRule.create(context);
    const mockNode: ASTNode = {
      type: "FunctionDeclaration",
      id: { type: "Identifier", name: "foo" },
      parent: { type: "ExportNamedDeclaration" },
    };

    visitors.FunctionDeclaration!(mockNode);

    expect(reportSpy).toHaveBeenCalledOnce();
  });

  it("should ignore declaration if it is marked as @internal", () => {
    setupMockPackage(
      {
        name: "test-pkg",
        exports: {
          ".": "./dist/index.js",
        },
      },
      {
        "src/index.ts": 'export { foo } from "./foo";',
        "src/foo.ts": "export function foo() {}",
      },
    );

    const reportSpy = vi.fn();
    const mockComments = [
      {
        type: "Line",
        value: " @internal",
      },
    ];

    const context = {
      filename: path.join(tempDir, "src/foo.ts"),
      report: reportSpy,
      sourceCode: {
        getCommentsBefore: vi.fn(() => mockComments),
      },
    };

    const visitors = requirePublicJsdocRule.create(context);
    const mockNode: ASTNode = {
      type: "FunctionDeclaration",
      id: { type: "Identifier", name: "foo" },
      parent: { type: "ExportNamedDeclaration" },
    };

    visitors.FunctionDeclaration!(mockNode);

    expect(reportSpy).not.toHaveBeenCalled();
  });

  it("should handle destructuring variable declarations correctly", () => {
    setupMockPackage(
      {
        name: "test-pkg",
        exports: {
          ".": "./dist/index.js",
        },
      },
      {
        "src/index.ts": 'export { a, b } from "./foo";',
        "src/foo.ts": "export const { a, b } = { a: 1, b: 2 };",
      },
    );

    const reportSpy = vi.fn();
    const context = {
      filename: path.join(tempDir, "src/foo.ts"),
      report: reportSpy,
      sourceCode: {
        getCommentsBefore: vi.fn(() => []),
      },
    };

    const visitors = requirePublicJsdocRule.create(context);
    const mockNode: ASTNode = {
      type: "VariableDeclaration",
      declarations: [
        {
          type: "VariableDeclarator",
          id: {
            type: "ObjectPattern",
            properties: [
              {
                type: "Property",
                key: { type: "Identifier", name: "a" },
                value: { type: "Identifier", name: "a" },
              },
              {
                type: "Property",
                key: { type: "Identifier", name: "b" },
                value: { type: "Identifier", name: "b" },
              },
            ],
          },
        },
      ],
      parent: { type: "ExportNamedDeclaration" },
    };

    visitors.VariableDeclaration!(mockNode);

    expect(reportSpy).toHaveBeenCalledOnce();
  });

  it("should handle default exports correctly", () => {
    setupMockPackage(
      {
        name: "test-pkg",
        exports: {
          ".": "./dist/index.js",
        },
      },
      {
        "src/index.ts": 'export { default } from "./foo";',
        "src/foo.ts": "export default class MyClass {}",
      },
    );

    const reportSpy = vi.fn();
    const context = {
      filename: path.join(tempDir, "src/foo.ts"),
      report: reportSpy,
      sourceCode: {
        getCommentsBefore: vi.fn(() => []),
      },
    };

    const visitors = requirePublicJsdocRule.create(context);
    const mockClassNode: ASTNode = {
      type: "ClassDeclaration",
      id: { type: "Identifier", name: "MyClass" },
      parent: { type: "ExportDefaultDeclaration" },
    };

    visitors.ClassDeclaration!(mockClassNode);
    expect(reportSpy).toHaveBeenCalledOnce();
  });

  it("should check TSInterfaceDeclaration, TSTypeAliasDeclaration, TSEnumDeclaration, and TSDeclareFunction", () => {
    setupMockPackage(
      {
        name: "test-pkg",
        exports: {
          ".": "./dist/index.js",
        },
      },
      {
        "src/index.ts": 'export { MyInterface, MyType, MyEnum, myFunction } from "./foo";',
        "src/foo.ts": `
          export interface MyInterface {}
          export type MyType = string;
          export enum MyEnum { A }
          export function myFunction(x: number): void;
        `,
      },
    );

    const reportSpy = vi.fn();
    const context = {
      filename: path.join(tempDir, "src/foo.ts"),
      report: reportSpy,
      sourceCode: {
        getCommentsBefore: vi.fn(() => []),
      },
    };

    const visitors = requirePublicJsdocRule.create(context);

    visitors.TSInterfaceDeclaration!({
      type: "TSInterfaceDeclaration",
      id: { type: "Identifier", name: "MyInterface" },
      parent: { type: "ExportNamedDeclaration" },
    });

    visitors.TSTypeAliasDeclaration!({
      type: "TSTypeAliasDeclaration",
      id: { type: "Identifier", name: "MyType" },
      parent: { type: "ExportNamedDeclaration" },
    });

    visitors.TSEnumDeclaration!({
      type: "TSEnumDeclaration",
      id: { type: "Identifier", name: "MyEnum" },
      parent: { type: "ExportNamedDeclaration" },
    });

    visitors.TSDeclareFunction!({
      type: "TSDeclareFunction",
      id: { type: "Identifier", name: "myFunction" },
      parent: { type: "ExportNamedDeclaration" },
    });

    expect(reportSpy).toHaveBeenCalledTimes(4);
  });
});
