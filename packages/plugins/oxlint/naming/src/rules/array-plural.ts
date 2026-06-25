/**
 * Represents an AST node processed by ESLint.
 */
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

/**
 * The ESLint context provided to rules.
 */
export interface RuleContext {
  report(descriptor: { node: ASTNode; messageId: string; data?: Record<string, string | number> }): void;
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

const IRREGULAR_PLURALS = new Set(["children", "people", "media", "data", "schema"]);
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

function isArrayTypeNode(typeNode: ASTNode | null | undefined): boolean {
  if (!typeNode) {
    return false;
  }
  if (typeNode.type === "TSArrayType") {
    return true;
  }
  if (
    typeNode.type === "TSTypeReference" &&
    typeNode.typeName &&
    typeNode.typeName.type === "Identifier" &&
    ["Array", "ReadonlyArray"].includes(typeNode.typeName.name || "")
  ) {
    return true;
  }
  if (typeNode.type === "TSTypeOperator" && typeNode.operator === "readonly") {
    return isArrayTypeNode(typeNode.typeAnnotation as ASTNode | undefined);
  }
  if (typeNode.type === "TSUnionType" && typeNode.types) {
    return (typeNode.types as ASTNode[]).some(isArrayTypeNode);
  }
  if (typeNode.type === "TSIntersectionType" && typeNode.types) {
    return (typeNode.types as ASTNode[]).some(isArrayTypeNode);
  }
  return false;
}

/**
 * ESLint rule that enforces that array variables end with 's'.
 */
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
    function checkArrayNode(options: {
      nameNode: ASTNode | null | undefined;
      typeAnnNode?: ASTNode | null | undefined;
      valueNode?: ASTNode | null | undefined;
    }) {
      const { nameNode, typeAnnNode, valueNode } = options;
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
        if (isArrayTypeNode(typeAnn as ASTNode | undefined)) {
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
          checkArrayNode({
            nameNode: node.id,
            typeAnnNode: node.id,
            valueNode: node.init as ASTNode | null | undefined,
          });
        }
      },
      PropertyDefinition(node: ASTNode) {
        if (!node.computed) {
          checkArrayNode({
            nameNode: node.key,
            typeAnnNode: node,
            valueNode: node.value as ASTNode | null | undefined,
          });
        }
      },
      TSPropertySignature(node: ASTNode) {
        if (!node.computed) {
          checkArrayNode({ nameNode: node.key, typeAnnNode: node });
        }
      },
      Property(node: ASTNode) {
        if (node.kind === "init" && !node.method && !node.computed) {
          checkArrayNode({ nameNode: node.key, valueNode: node.value as ASTNode | null | undefined });
        }
      },
    };
  },
};
