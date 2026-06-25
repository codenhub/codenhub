import type { ASTNode, RuleContext } from "./types";

/**
 * Helper to get names declared by a node.
 */
export function getDeclaredNames(node: ASTNode): string[] {
  if (!node) {
    return [];
  }
  switch (node.type) {
    case "FunctionDeclaration":
    case "TSDeclareFunction":
    case "ClassDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
    case "TSEnumDeclaration":
      return node.id && node.id.name ? [node.id.name] : [];
    case "VariableDeclaration":
      const names: string[] = [];
      if (node.declarations) {
        for (const decl of node.declarations) {
          if (!decl.id) {
            continue;
          }
          if (decl.id.type === "Identifier") {
            names.push((decl.id as { name: string }).name);
          } else {
            // Handle destructuring
            const extractIdentifiers = (pattern: unknown) => {
              if (!pattern) {
                return;
              }
              const p = pattern as ASTNode;
              if (p.type === "Identifier") {
                names.push(p.name || (p as { id?: { name: string } }).id?.name || "");
              } else if (p.type === "Property") {
                extractIdentifiers(p.value);
              } else if (p.type === "ObjectPattern") {
                if (p.properties) {
                  p.properties.forEach(extractIdentifiers);
                }
              } else if (p.type === "ArrayPattern") {
                if (p.elements) {
                  p.elements.forEach((el) => {
                    if (el) {
                      extractIdentifiers(el);
                    }
                  });
                }
              } else if (p.type === "AssignmentPattern") {
                extractIdentifiers(p.left);
              } else if (p.type === "RestElement") {
                extractIdentifiers(p.argument);
              }
            };
            extractIdentifiers(decl.id);
          }
        }
      }
      return names;
    default:
      return [];
  }
}

/**
 * Helper to retrieve comments immediately before the node or its export parent.
 */
export function getCommentsBeforeWithParent(node: ASTNode, context: RuleContext): { type: string; value: string }[] {
  const sourceCode = context.sourceCode;
  let targetNode = node;
  if (
    node.parent &&
    (node.parent.type === "ExportNamedDeclaration" || node.parent.type === "ExportDefaultDeclaration")
  ) {
    targetNode = node.parent;
  }
  if (sourceCode && typeof sourceCode.getCommentsBefore === "function") {
    return sourceCode.getCommentsBefore(targetNode) || [];
  }
  return (targetNode.leadingComments as { type: string; value: string }[]) || [];
}
