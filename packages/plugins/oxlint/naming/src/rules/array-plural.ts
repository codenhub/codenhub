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

const IRREGULAR_PLURALS = new Set(["children", "people", "media", "data"]);
const COLLECTIVE_SUFFIX_PATTERN = /(?:List|Group|Set|Collection|Array)$/i;

function isValidArrayName(name: string): boolean {
  if (name.endsWith("s") || name.endsWith("S")) {
    return true;
  }
  if (IRREGULAR_PLURALS.has(name.toLowerCase())) {
    return true;
  }
  return COLLECTIVE_SUFFIX_PATTERN.test(name);
}

export const arrayPluralRule: RuleModule = {
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
    function checkArrayNode(
      nameNode: ASTNode | null | undefined,
      typeAnnNode: ASTNode | null | undefined,
      valueNode: ASTNode | null | undefined,
    ) {
      if (!nameNode) {
        return;
      }
      const name =
        nameNode.name ?? (nameNode.type === "Literal" && typeof nameNode.value === "string" ? nameNode.value : null);
      if (!name || isValidArrayName(name)) {
        return;
      }

      let isArray = false;

      // Check TS Type Annotation first
      const typeAnnParent = typeAnnNode ?? nameNode;
      const typeAnnNodeObj = typeAnnParent.typeAnnotation as ASTNode | null | undefined;
      if (typeAnnNodeObj && typeAnnNodeObj.type === "TSTypeAnnotation") {
        const typeAnn = typeAnnNodeObj.typeAnnotation;
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

      // Check initializer / value
      if (!isArray && valueNode) {
        const val = valueNode;
        if (val.type === "ArrayExpression") {
          isArray = true;
        } else if (
          val.type === "NewExpression" &&
          val.callee &&
          val.callee.type === "Identifier" &&
          val.callee.name === "Array"
        ) {
          isArray = true;
        } else if (
          val.type === "CallExpression" &&
          val.callee &&
          val.callee.type === "Identifier" &&
          val.callee.name === "Array"
        ) {
          isArray = true;
        } else if (
          val.type === "CallExpression" &&
          val.callee &&
          val.callee.type === "MemberExpression" &&
          val.callee.object &&
          val.callee.object.type === "Identifier" &&
          val.callee.object.name === "Array" &&
          val.callee.property &&
          val.callee.property.type === "Identifier" &&
          ["from", "of"].includes(val.callee.property.name || "")
        ) {
          isArray = true;
        }
      }

      if (isArray) {
        context.report({
          node: nameNode,
          messageId: "arrayPlural",
          data: { name },
        });
      }
    }

    return {
      VariableDeclarator(node: ASTNode) {
        if (node.id && node.id.type === "Identifier") {
          checkArrayNode(node.id, node.id, node.init as ASTNode | null | undefined);
        }
      },
      PropertyDefinition(node: ASTNode) {
        if (!node.computed) {
          checkArrayNode(node.key, node, node.value as ASTNode | null | undefined);
        }
      },
      TSPropertySignature(node: ASTNode) {
        if (!node.computed) {
          checkArrayNode(node.key, node, undefined);
        }
      },
      Property(node: ASTNode) {
        if (node.kind === "init" && !node.method && !node.computed) {
          checkArrayNode(node.key, undefined, node.value as ASTNode | null | undefined);
        }
      },
    };
  },
};
