export interface ASTNode {
  type: string;
  params?: ASTNode[];
  parent?: ASTNode;
  arguments?: ASTNode[];
  [key: string]: unknown;
}

export interface RuleContext {
  getFilename(): string;
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

export const maxParamsRule: RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce a maximum number of parameters in functions.",
      category: "Stylistic Issues",
      recommended: false,
    },
    schema: [],
    messages: {
      maxParams: "Function has {{count}} parameters. Maximum allowed is 2. Refactor into a typed object.",
    },
  },
  create(context): Record<string, (node: ASTNode) => void> {
    const filename = context.getFilename();
    const isTestFile = /\.(test|spec)\.[jt]sx?$/.test(filename) || /[\\/]__tests__[\\/]/.test(filename);

    if (isTestFile) {
      return {};
    }

    function checkFunction(node: ASTNode) {
      if (node.params && node.params.length >= 3) {
        const parent = node.parent;

        // Exclude functions passed as arguments (callbacks)
        if (
          parent &&
          (parent.type === "CallExpression" || parent.type === "NewExpression") &&
          parent.arguments &&
          parent.arguments.includes(node)
        ) {
          return;
        }

        context.report({
          node,
          messageId: "maxParams",
          data: {
            count: node.params.length,
          },
        });
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};
