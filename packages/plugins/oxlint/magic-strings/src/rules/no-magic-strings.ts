/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Rule } from "eslint";

/**
 * ESLint rule to disallow magic strings inside functions.
 */
export const noMagicStrings: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow magic strings inside functions",
      category: "Best Practices",
      recommended: false,
    },
    schema: [],
    messages: {
      noMagicStrings: "Magic string '{{value}}' should be avoided. Assign it to a constant instead.",
    },
  },
  create(context: any) {
    function isInsideFunction(node: any): boolean {
      let parent = node.parent;
      while (parent) {
        if (
          parent.type === "FunctionDeclaration" ||
          parent.type === "FunctionExpression" ||
          parent.type === "ArrowFunctionExpression"
        ) {
          return true;
        }
        parent = parent.parent;
      }
      return false;
    }

    function isAssignedToConst(node: any): boolean {
      let current = node;
      while (
        current.parent &&
        (current.parent.type === "TSAsExpression" ||
          current.parent.type === "TSTypeAssertion" ||
          current.parent.type === "TSNonNullExpression")
      ) {
        current = current.parent;
      }
      const parent = current.parent;
      if (parent?.type === "VariableDeclarator") {
        const varDecl = parent.parent;
        if (varDecl?.type === "VariableDeclaration" && varDecl.kind === "const") {
          return true;
        }
      }
      return false;
    }

    function isWithinJSX(node: any): boolean {
      let current = node.parent;
      while (current) {
        if (current.type.startsWith("JSX")) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    function isImportExportOrRequire(node: any): boolean {
      const parent = node.parent;
      if (!parent) {
        return false;
      }

      if (
        (parent.type === "ImportDeclaration" ||
          parent.type === "ExportNamedDeclaration" ||
          parent.type === "ExportAllDeclaration" ||
          parent.type === "ImportExpression") &&
        parent.source === node
      ) {
        return true;
      }

      if (
        parent.type === "CallExpression" &&
        parent.callee.type === "Identifier" &&
        parent.callee.name === "require" &&
        parent.arguments[0] === node
      ) {
        return true;
      }

      return false;
    }

    function isObjectPropertyKey(node: any): boolean {
      const parent = node.parent;
      if (!parent) {
        return false;
      }

      if (parent.type === "MemberExpression" && parent.property === node) {
        return true;
      }

      if (
        (parent.type === "Property" ||
          parent.type === "PropertyDefinition" ||
          parent.type === "MethodDefinition" ||
          parent.type === "TSPropertySignature" ||
          parent.type === "TSMethodSignature") &&
        parent.key === node
      ) {
        return true;
      }

      return false;
    }

    function isWithinTypeAnnotation(node: any): boolean {
      let current = node.parent;
      while (current) {
        if (
          current.type.startsWith("TS") &&
          current.type !== "TSAsExpression" &&
          current.type !== "TSTypeAssertion" &&
          current.type !== "TSNonNullExpression"
        ) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    function checkLiteral(node: any, value: string) {
      if (value === "") {
        return; // Empty string is allowed
      }

      if (!isInsideFunction(node)) {
        return;
      }

      if (isAssignedToConst(node)) {
        return;
      }

      if (isWithinJSX(node)) {
        return;
      }

      if (isImportExportOrRequire(node)) {
        return;
      }

      if (isObjectPropertyKey(node)) {
        return;
      }

      if (isWithinTypeAnnotation(node)) {
        return;
      }

      context.report({
        node,
        messageId: "noMagicStrings",
        data: {
          value,
        },
      });
    }

    return {
      Literal(node: any) {
        if (typeof node.value === "string") {
          checkLiteral(node, node.value);
        }
      },
      TemplateLiteral(node: any) {
        if (node.expressions.length === 0 && node.quasis.length > 0) {
          const value = node.quasis[0].value.cooked ?? "";
          checkLiteral(node, value);
        }
      },
    };
  },
};
