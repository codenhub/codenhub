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

const rule: RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce that array variables end with 's'",
      recommended: true,
    },
    schema: [],
    messages: {
      arrayPlural: "Array variable '{{ name }}' should end with 's'.",
    },
  },
  create(context) {
    function checkArrayVariable(node: ASTNode) {
      if (!node.id || node.id.type !== "Identifier") {
        return;
      }

      const name = node.id.name;
      if (!name) {
        return;
      }

      const isValid = name.endsWith("s") || name.endsWith("S");
      if (isValid) {
        return;
      }

      let isArray = false;

      // Check TS Type Annotation first
      if (node.id.typeAnnotation && node.id.typeAnnotation.type === "TSTypeAnnotation") {
        const typeAnn = node.id.typeAnnotation.typeAnnotation;
        if (typeAnn && typeAnn.type === "TSArrayType") {
          isArray = true;
        } else if (
          typeAnn &&
          typeAnn.type === "TSTypeReference" &&
          typeAnn.typeName &&
          typeAnn.typeName.type === "Identifier" &&
          ["Array", "ReadonlyArray"].includes(typeAnn.typeName.name || "")
        ) {
          isArray = true;
        }
      }

      // Check initializer
      if (!isArray && node.init) {
        const init = node.init;
        if (init.type === "ArrayExpression") {
          isArray = true;
        } else if (
          init.type === "NewExpression" &&
          init.callee &&
          init.callee.type === "Identifier" &&
          init.callee.name === "Array"
        ) {
          isArray = true;
        } else if (
          init.type === "CallExpression" &&
          init.callee &&
          init.callee.type === "Identifier" &&
          init.callee.name === "Array"
        ) {
          isArray = true;
        } else if (
          init.type === "CallExpression" &&
          init.callee &&
          init.callee.type === "MemberExpression" &&
          init.callee.object &&
          init.callee.object.type === "Identifier" &&
          init.callee.object.name === "Array" &&
          init.callee.property &&
          init.callee.property.type === "Identifier" &&
          ["from", "of"].includes(init.callee.property.name || "")
        ) {
          isArray = true;
        }
      }

      if (isArray) {
        context.report({
          node: node.id,
          messageId: "arrayPlural",
          data: { name },
        });
      }
    }

    return {
      VariableDeclarator(node: ASTNode) {
        checkArrayVariable(node);
      },
    };
  },
};

export default rule;
