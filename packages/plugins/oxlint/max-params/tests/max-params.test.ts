import { describe, it, expect } from "vitest";

import { maxParamsRule } from "../src/rules/max-params.js";
import type { ASTNode, RuleContext } from "../src/rules/max-params.js";

interface MockReport {
  node: ASTNode;
  messageId: string;
  data?: Record<string, string | number>;
}

function runRule(node: ASTNode, filename: string = "src/index.ts") {
  const reports: MockReport[] = [];

  const mockContext: RuleContext = {
    getFilename: () => filename,
    report: (descriptor) => {
      reports.push(descriptor);
    },
  };

  const visitors = maxParamsRule.create(mockContext);

  function traverse(currentNode: ASTNode | undefined, parentNode: ASTNode | undefined = undefined) {
    if (!currentNode) {
      return;
    }

    currentNode.parent = parentNode;

    const visitor = visitors[currentNode.type];
    if (visitor) {
      visitor(currentNode);
    }

    if (currentNode.arguments) {
      for (const arg of currentNode.arguments) {
        traverse(arg, currentNode);
      }
    }
  }

  traverse(node);
  return reports;
}

describe("max-params rule", () => {
  it("should not report function declarations with 2 or fewer parameters", () => {
    const node: ASTNode = {
      type: "FunctionDeclaration",
      params: [{ type: "Identifier" }, { type: "Identifier" }],
    };

    const reports = runRule(node);
    expect(reports).toHaveLength(0);
  });

  it("should report function declarations with 3 parameters", () => {
    const node: ASTNode = {
      type: "FunctionDeclaration",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const reports = runRule(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual({
      node,
      messageId: "maxParams",
      data: { count: 3 },
    });
  });

  it("should report function expressions with 4 parameters", () => {
    const node: ASTNode = {
      type: "FunctionExpression",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const reports = runRule(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual({
      node,
      messageId: "maxParams",
      data: { count: 4 },
    });
  });

  it("should report arrow function expressions with 3 parameters", () => {
    const node: ASTNode = {
      type: "ArrowFunctionExpression",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const reports = runRule(node);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual({
      node,
      messageId: "maxParams",
      data: { count: 3 },
    });
  });

  it("should ignore test files ending with .test.ts", () => {
    const node: ASTNode = {
      type: "FunctionDeclaration",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const reports = runRule(node, "src/utils.test.ts");
    expect(reports).toHaveLength(0);
  });

  it("should ignore test files ending with .spec.ts", () => {
    const node: ASTNode = {
      type: "FunctionDeclaration",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const reports = runRule(node, "src/utils.spec.ts");
    expect(reports).toHaveLength(0);
  });

  it("should ignore files inside __tests__ directory", () => {
    const node: ASTNode = {
      type: "FunctionDeclaration",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const reportsWindows = runRule(node, "src\\__tests__\\utils.ts");
    expect(reportsWindows).toHaveLength(0);

    const reportsUnix = runRule(node, "src/__tests__/utils.ts");
    expect(reportsUnix).toHaveLength(0);
  });

  it("should ignore functions passed as arguments (callbacks) to CallExpression", () => {
    const callbackNode: ASTNode = {
      type: "ArrowFunctionExpression",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const parentNode: ASTNode = {
      type: "CallExpression",
      arguments: [callbackNode],
    };

    const reports = runRule(parentNode);
    expect(reports).toHaveLength(0);
  });

  it("should ignore functions passed as arguments (callbacks) to NewExpression", () => {
    const callbackNode: ASTNode = {
      type: "FunctionExpression",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const parentNode: ASTNode = {
      type: "NewExpression",
      arguments: [callbackNode],
    };

    const reports = runRule(parentNode);
    expect(reports).toHaveLength(0);
  });

  it("should still report functions immediately invoked (IIFE) as they are the callee, not an argument", () => {
    const functionNode: ASTNode = {
      type: "FunctionExpression",
      params: [{ type: "Identifier" }, { type: "Identifier" }, { type: "Identifier" }],
    };

    const parentNode: ASTNode = {
      type: "CallExpression",
      callee: functionNode,
      arguments: [],
    };

    functionNode.parent = parentNode;

    const reports = runRule(functionNode);
    expect(reports).toHaveLength(1);
  });
});
