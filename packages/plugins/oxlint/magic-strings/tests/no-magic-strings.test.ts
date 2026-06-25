/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";

import { noMagicStrings } from "../src/rules/no-magic-strings";

function setParents(node: any, parent?: any) {
  if (!node || typeof node !== "object") {
    return;
  }
  if ("type" in node && parent) {
    node.parent = parent;
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") {
      continue;
    }
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

function runRule(tree: any) {
  setParents(tree);
  const reports: any[] = [];
  const context = {
    report(options: any) {
      reports.push(options);
    },
  } as any;

  const visitors = noMagicStrings.create(context);

  function traverse(node: any) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type && (visitors as any)[node.type]) {
      (visitors as any)[node.type](node);
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") {
        continue;
      }
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

describe("no-magic-strings ESLint rule", () => {
  it("should not report string literals outside functions", () => {
    const tree = {
      type: "Program",
      body: [
        {
          type: "VariableDeclaration",
          kind: "let",
          declarations: [
            {
              type: "VariableDeclarator",
              init: { type: "Literal", value: "hello" },
            },
          ],
        },
      ],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should report string literals inside functions", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ExpressionStatement",
            expression: { type: "Literal", value: "magic" },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].messageId).toBe("noMagicStrings");
    expect(reports[0].data.value).toBe("magic");
  });

  it("should not report string literals assigned to const inside functions", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "VariableDeclaration",
            kind: "const",
            declarations: [
              {
                type: "VariableDeclarator",
                init: { type: "Literal", value: "allowed" },
              },
            ],
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should report string literals assigned to let inside functions", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "VariableDeclaration",
            kind: "let",
            declarations: [
              {
                type: "VariableDeclarator",
                init: { type: "Literal", value: "magic" },
              },
            ],
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
  });

  it("should report string literals assigned to var inside functions", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "VariableDeclaration",
            kind: "var",
            declarations: [
              {
                type: "VariableDeclarator",
                init: { type: "Literal", value: "magic" },
              },
            ],
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
  });

  it("should not report empty string literals inside functions", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ExpressionStatement",
            expression: { type: "Literal", value: "" },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should not report within JSX attributes or children", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "JSXElement",
            openingElement: {
              type: "JSXOpeningElement",
              attributes: [
                {
                  type: "JSXAttribute",
                  value: { type: "Literal", value: "container" },
                },
              ],
            },
            children: [
              {
                type: "JSXText",
                value: "child text",
              },
              {
                type: "Literal",
                value: "child literal",
              },
            ],
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should not report string literals in import sources", () => {
    const tree = {
      type: "ImportDeclaration",
      source: { type: "Literal", value: "my-module" },
      specifiers: [],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should not report string literals in export sources", () => {
    const tree = {
      type: "ExportNamedDeclaration",
      source: { type: "Literal", value: "my-module" },
      specifiers: [],
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should not report require calls", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "CallExpression",
              callee: { type: "Identifier", name: "require" },
              arguments: [{ type: "Literal", value: "my-package" }],
            },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should not report dynamic import expressions", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "ImportExpression",
              source: { type: "Literal", value: "my-package" },
            },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should not report object property keys", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "ObjectExpression",
              properties: [
                {
                  type: "Property",
                  key: { type: "Literal", value: "my-key" },
                  value: { type: "Literal", value: "magic-value" },
                },
              ],
            },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].data.value).toBe("magic-value");
  });

  it("should not report property access with computed properties", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "MemberExpression",
              object: { type: "Identifier", name: "obj" },
              property: { type: "Literal", value: "my-prop" },
              computed: true,
            },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should not report property access with optional computed properties", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "OptionalMemberExpression",
              object: { type: "Identifier", name: "obj" },
              property: { type: "Literal", value: "my-prop" },
              computed: true,
            },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should not report string literals in type annotations", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "TSTypeAnnotation",
            typeAnnotation: {
              type: "TSUnionType",
              types: [
                {
                  type: "TSLiteralType",
                  literal: { type: "Literal", value: "alice" },
                },
              ],
            },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });

  it("should report non-const template literals inside functions", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ExpressionStatement",
            expression: {
              type: "TemplateLiteral",
              expressions: [],
              quasis: [
                {
                  type: "TemplateElement",
                  value: { cooked: "magic-template" },
                },
              ],
            },
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(1);
    expect(reports[0].data.value).toBe("magic-template");
  });

  it("should not report const template literals inside functions", () => {
    const tree = {
      type: "FunctionDeclaration",
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "VariableDeclaration",
            kind: "const",
            declarations: [
              {
                type: "VariableDeclarator",
                init: {
                  type: "TemplateLiteral",
                  expressions: [],
                  quasis: [
                    {
                      type: "TemplateElement",
                      value: { cooked: "allowed-template" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };
    const reports = runRule(tree);
    expect(reports).toHaveLength(0);
  });
});
