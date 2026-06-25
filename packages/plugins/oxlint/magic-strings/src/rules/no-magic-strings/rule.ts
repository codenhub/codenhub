import {
  isAssignedToConst,
  isAssignedToKnownProperty,
  isComparedToMetadataProperty,
  isInherentlySafeValue,
  isInsideFunction,
  isInsideJSX,
  isInsideSafeCallOrError,
  isInsideTypeAnnotation,
  isMetadataPropertyValue,
  isModuleSpecifier,
  isPropertyKey,
  isSwitchCaseOnMetadata,
  isTypeofComparison,
} from "./predicates";
import type { ASTNode, RuleModule } from "./types";

// ---------------------------------------------------------------------------
// Exemption pipeline — each entry is a predicate that, when true, means the
// string is NOT magic. Ordered from cheapest to most expensive check.
// ---------------------------------------------------------------------------

/**
 * Ordered list of exemption checks. A string literal is allowed (not magic)
 * if any of these return true. The order matters for performance: cheap
 * parent-level checks run before expensive ancestor-walking checks.
 */
const EXEMPTIONS: ReadonlyArray<(node: ASTNode) => boolean> = [
  isAssignedToConst,
  isPropertyKey,
  isModuleSpecifier,
  isTypeofComparison,
  isMetadataPropertyValue,
  isComparedToMetadataProperty,
  isSwitchCaseOnMetadata,
  isAssignedToKnownProperty,
  // Ancestor-walking checks (more expensive)
  isInsideJSX,
  isInsideTypeAnnotation,
  isInsideSafeCallOrError,
];

// ---------------------------------------------------------------------------
// Rule definition
// ---------------------------------------------------------------------------

/**
 * ESLint rule that flags string literals inside functions that aren't
 * assigned to a named constant or covered by a known exemption.
 */
export const noMagicStrings: RuleModule = {
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

  create(context) {
    function checkLiteral(node: ASTNode, value: string) {
      if (isInherentlySafeValue(value)) {
        return;
      }

      // Only flag strings that appear inside function bodies
      if (!isInsideFunction(node)) {
        return;
      }

      // Check each exemption; bail on the first match
      for (const isExempt of EXEMPTIONS) {
        if (isExempt(node)) {
          return;
        }
      }

      context.report({
        node,
        messageId: "noMagicStrings",
        data: { value },
      });
    }

    return {
      Literal(node: ASTNode) {
        if (typeof node.value === "string") {
          checkLiteral(node, node.value);
        }
      },
      TemplateLiteral(node: ASTNode) {
        if (node.expressions?.length === 0 && node.quasis && node.quasis.length > 0) {
          const value = node.quasis[0].value.cooked ?? "";
          checkLiteral(node, value);
        }
      },
    };
  },
};
