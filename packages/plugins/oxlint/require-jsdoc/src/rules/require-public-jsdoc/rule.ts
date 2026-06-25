import path from "node:path";

import { getCommentsBeforeWithParent, getDeclaredNames } from "./helpers";
import { findPackageJson } from "./resolution";
import { getPublicSymbols } from "./symbols";
import type { ASTNode, RuleModule } from "./types";

/**
 * ESLint rule that enforces JSDoc comments for exported public declarations in entry points.
 */
export const requirePublicJsdocRule: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce JSDoc comments for exported public declarations in entry points",
      category: "Possible Errors",
      recommended: true,
    },
    messages: {
      missingJSDoc: 'Public export "{{name}}" is missing a JSDoc comment.',
    },
    schema: [],
  },
  create(context): Record<string, (node: ASTNode) => void> {
    const filename = context.filename
      ? context.filename
      : typeof context.getFilename === "function"
        ? context.getFilename()
        : "";
    if (!filename) {
      return {};
    }

    const absoluteFilename = path.resolve(filename);
    const pkgInfo = findPackageJson(absoluteFilename);
    if (!pkgInfo) {
      return {};
    }

    const { pkgDir, pkgJson } = pkgInfo;
    const publicSymbols = getPublicSymbols(pkgDir, pkgJson);
    const filePublicSymbols = publicSymbols.get(path.normalize(absoluteFilename));

    if (!filePublicSymbols || filePublicSymbols.size === 0) {
      return {};
    }

    function checkJSDoc(node: ASTNode, name: string) {
      const comments = getCommentsBeforeWithParent(node, context);

      const isInternal = comments.some((comment) => {
        return comment.value && comment.value.includes("@internal");
      });
      if (isInternal) {
        return;
      }

      let hasValidJSDoc = false;
      if (comments.length > 0) {
        const lastComment = comments[comments.length - 1];
        if (lastComment.type === "Block" && lastComment.value && lastComment.value.startsWith("*")) {
          hasValidJSDoc = true;
        }
      }

      if (!hasValidJSDoc) {
        context.report({
          node,
          messageId: "missingJSDoc",
          data: { name },
        });
      }
    }

    function checkDeclaration(node: ASTNode) {
      const isTopLevel =
        node.parent &&
        (node.parent.type === "Program" ||
          node.parent.type === "ExportNamedDeclaration" ||
          node.parent.type === "ExportDefaultDeclaration");
      if (!isTopLevel) {
        return;
      }

      const declaredNames = getDeclaredNames(node);
      for (const name of declaredNames) {
        if (
          filePublicSymbols!.has(name) ||
          (node.parent!.type === "ExportDefaultDeclaration" && filePublicSymbols!.has("default"))
        ) {
          checkJSDoc(node, name);
          break;
        }
      }
    }

    return {
      FunctionDeclaration: checkDeclaration,
      TSDeclareFunction: checkDeclaration,
      ClassDeclaration: checkDeclaration,
      TSTypeAliasDeclaration: checkDeclaration,
      TSInterfaceDeclaration: checkDeclaration,
      TSEnumDeclaration: checkDeclaration,
      VariableDeclaration: checkDeclaration,
      ExportDefaultDeclaration(node: ASTNode) {
        const decl = node.declaration;
        if (decl) {
          const isNamedDeclaration =
            decl.type === "FunctionDeclaration" ||
            decl.type === "TSDeclareFunction" ||
            decl.type === "ClassDeclaration" ||
            decl.type === "VariableDeclaration" ||
            decl.type === "TSTypeAliasDeclaration" ||
            decl.type === "TSInterfaceDeclaration" ||
            decl.type === "TSEnumDeclaration";
          if (isNamedDeclaration && decl.id) {
            return;
          }
        }
        if (filePublicSymbols!.has("default")) {
          checkJSDoc(node, "default");
        }
      },
    };
  },
};
