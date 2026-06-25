export interface ASTNode {
  type: string;
  operator?: string;
  value?: unknown;
  id?: ASTNode;
  init?: ASTNode | null;
  kind?: string;
  method?: boolean;
  computed?: boolean;
  key?: ASTNode;
  name?: string;
  typeAnnotation?: ASTNode;
  callee?: ASTNode;
  property?: ASTNode;
  object?: ASTNode;
  typeName?: ASTNode;
  [key: string]: unknown;
}

export interface RuleContext {
  report(descriptor: { node: ASTNode; messageId: string; data?: Record<string, string | number> }): void;
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

export const booleanPrefixRule: RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce that boolean variables and properties start with a boolean prefix (is, has, can, should)",
      recommended: true,
    },
    schema: [],
    messages: {
      booleanPrefix: "Boolean variable or property '{{ name }}' must start with 'is', 'has', 'can', or 'should'.",
    },
  },
  create(context) {
    function isValidBooleanName(name: string): boolean {
      // camelCase: isLoading, hasError, canEdit, shouldRetry
      if (/^(is|has|can|should)([A-Z0-9_].*)?$/.test(name)) {
        return true;
      }
      // SCREAMING_SNAKE_CASE: IS_LOADING, HAS_ERROR, DEFAULT_IS_LOADING, PREFIX_SHOULD_RETRY
      if (/(?:^|_)(IS|HAS|CAN|SHOULD)(_[A-Z0-9].*)?$/.test(name)) {
        return true;
      }
      return false;
    }

    function isBooleanExpression(node: ASTNode | null | undefined): boolean {
      if (!node) {
        return false;
      }

      if (node.type === "Literal") {
        return typeof node.value === "boolean";
      }

      if (node.type === "BinaryExpression") {
        return ["===", "!==", "==", "!=", "<", "<=", ">", ">="].includes(node.operator || "");
      }

      if (node.type === "LogicalExpression") {
        if (node.operator !== "&&" && node.operator !== "||") {
          return false;
        }
        // If the right-hand side is a known non-boolean type, it's not a boolean expression
        const right = node.right as ASTNode | null | undefined;
        if (right && right.type === "Literal") {
          return typeof right.value === "boolean";
        }
        return true;
      }

      if (node.type === "UnaryExpression" && node.operator === "!") {
        return true;
      }

      return false;
    }

    function getPropertyName(node: ASTNode | null | undefined): string | null {
      if (!node) {
        return null;
      }
      if (node.type === "Identifier") {
        return node.name || null;
      }
      if (node.type === "Literal" && typeof node.value === "string") {
        return node.value;
      }
      return null;
    }

    // Allowlist for property names that are mandated by platform specifications
    // and conventions, where renaming would break or violate expectations.
    const SPEC_MANDATED_NAMES = new Set([
      "configurable",
      "enumerable",
      "writable",
      "recommended",
      "ok",
      "checked",
      "enabled",
    ]);

    function checkName(nameNode: ASTNode | null | undefined, initNode: ASTNode | null | undefined) {
      if (!nameNode) {
        return;
      }
      const name = getPropertyName(nameNode);
      if (name && isBooleanExpression(initNode)) {
        if (SPEC_MANDATED_NAMES.has(name)) {
          return;
        }
        if (!isValidBooleanName(name)) {
          context.report({
            node: nameNode,
            messageId: "booleanPrefix",
            data: { name },
          });
        }
      }
    }

    return {
      VariableDeclarator(node: ASTNode) {
        checkName(node.id, node.init);
      },
      Property(node: ASTNode) {
        if (node.kind === "init" && !node.method && !node.computed) {
          checkName(node.key, node.value as ASTNode | null | undefined);
        }
      },
      PropertyDefinition(node: ASTNode) {
        if (!node.computed) {
          checkName(node.key, node.value as ASTNode | null | undefined);
        }
      },
    };
  },
};
