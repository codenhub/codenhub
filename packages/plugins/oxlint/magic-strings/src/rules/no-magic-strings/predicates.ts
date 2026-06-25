import {
  DOM_PROPERTIES,
  FILE_EXT_PATTERN,
  JS_TYPE_NAMES,
  MARKUP_PATTERN,
  METADATA_KEYS,
  PROTOCOL_CONSTANTS,
  SAFE_METHODS,
} from "./allowlists";
import type { ASTNode } from "./types";

// ---------------------------------------------------------------------------
// Shared constants used by multiple predicates
// ---------------------------------------------------------------------------

/** Equality operators used in comparisons. */
const EQUALITY_OPERATORS = new Set(["===", "!==", "==", "!="]);

const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/** TS cast nodes wrap runtime expressions — they are NOT type-only contexts. */
const TS_CAST_TYPES = new Set(["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression"]);

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the property name from an expression node. Handles identifiers,
 * member expressions (including optional chaining), and string-literal keys.
 */
function getPropertyName(node: ASTNode | undefined): string | null {
  if (!node) {
    return null;
  }

  // Unwrap optional chaining: `a?.b` → MemberExpression inside ChainExpression
  if (node.type === "ChainExpression") {
    return getPropertyName(node.expression);
  }

  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    const prop = node.property;
    if (!prop) {
      return null;
    }
    if (prop.type === "Identifier") {
      return prop.name ?? null;
    }
    if (prop.type === "Literal" && typeof prop.value === "string") {
      return prop.value;
    }
    return null;
  }

  if (node.type === "Identifier") {
    return node.name ?? null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Value-level checks — the string content itself is always safe
// ---------------------------------------------------------------------------

/**
 * Returns true when the string value is inherently safe regardless of
 * context (empty, short delimiter, known type name, protocol constant,
 * markup, or file extension).
 */
export function isInherentlySafeValue(value: string): boolean {
  if (value === "" || value.length <= 2) {
    return true;
  }
  if (JS_TYPE_NAMES.has(value)) {
    return true;
  }
  if (PROTOCOL_CONSTANTS.has(value.toLowerCase())) {
    return true;
  }
  if (MARKUP_PATTERN.test(value)) {
    return true;
  }
  if (FILE_EXT_PATTERN.test(value)) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Ancestor-walking predicates
// ---------------------------------------------------------------------------

/** Returns true when the node is nested inside a function body. */
export interface AncestorInfo {
  isInsideFunction: boolean;
  isInsideJSX: boolean;
  isInsideTypeAnnotation: boolean;
  isInsideSafeCallOrError: boolean;
}

/**
 * Traverses parent chain once to retrieve ancestor states, optimizing performance.
 */
export function getAncestorInfo(node: ASTNode): AncestorInfo {
  const info: AncestorInfo = {
    isInsideFunction: false,
    isInsideJSX: false,
    isInsideTypeAnnotation: false,
    isInsideSafeCallOrError: false,
  };

  let current = node.parent;
  let hasCrossedFunction = false;

  while (current) {
    const type = current.type;

    if (FUNCTION_TYPES.has(type)) {
      info.isInsideFunction = true;
      hasCrossedFunction = true;
    }

    if (type.startsWith("JSX")) {
      info.isInsideJSX = true;
    }

    if (type.startsWith("TS") && !TS_CAST_TYPES.has(type)) {
      info.isInsideTypeAnnotation = true;
    }

    if (!hasCrossedFunction) {
      if (type === "ThrowStatement") {
        info.isInsideSafeCallOrError = true;
      } else if (type === "NewExpression") {
        const callee = current.callee;
        if (callee?.type === "Identifier" && callee.name?.endsWith("Error")) {
          info.isInsideSafeCallOrError = true;
        }
      } else if (type === "CallExpression") {
        const callee = current.callee;

        // console.log("..."), console.error("...")
        if (callee?.type === "MemberExpression") {
          if (callee.object?.type === "Identifier" && callee.object.name === "console") {
            info.isInsideSafeCallOrError = true;
          }
          const methodName = callee.property?.type === "Identifier" ? callee.property.name : null;
          if (methodName && SAFE_METHODS.has(methodName)) {
            info.isInsideSafeCallOrError = true;
          }
        }

        // Direct safe function call: emit("event")
        if (callee?.type === "Identifier" && SAFE_METHODS.has(callee.name ?? "")) {
          info.isInsideSafeCallOrError = true;
        }
      }
    }

    current = current.parent;
  }

  return info;
}

// ---------------------------------------------------------------------------
// Parent-level predicates — check the immediate context of the literal
// ---------------------------------------------------------------------------

/**
 * True when the string is assigned to a `const` variable, possibly wrapped
 * in a TS cast expression (e.g. `const x = "foo" as const`).
 */
export function isAssignedToConst(node: ASTNode): boolean {
  let current: ASTNode = node;

  // Unwrap TS cast wrappers that sit between the literal and its declarator
  while (current.parent && TS_CAST_TYPES.has(current.parent.type)) {
    current = current.parent;
  }

  const parent = current.parent;
  if (parent?.type !== "VariableDeclarator") {
    return false;
  }
  const declaration = parent.parent;
  return declaration?.type === "VariableDeclaration" && declaration.kind === "const";
}

/** True when the node is the `source` of an import/export/require statement. */
export function isModuleSpecifier(node: ASTNode): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  const isStaticImportExport =
    parent.type === "ImportDeclaration" ||
    parent.type === "ExportNamedDeclaration" ||
    parent.type === "ExportAllDeclaration" ||
    parent.type === "ImportExpression";

  if (isStaticImportExport && parent.source === node) {
    return true;
  }

  // require("...")
  return (
    parent.type === "CallExpression" &&
    parent.callee?.type === "Identifier" &&
    parent.callee.name === "require" &&
    parent.arguments?.[0] === node
  );
}

/** True when the node is used as an object/member key, not a value. */
export function isPropertyKey(node: ASTNode): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }

  // obj["key"] or obj?.["key"]
  if ((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") && parent.property === node) {
    return true;
  }

  // { "key": value }, class { "key" = ... }, interface { "key": ... }
  const isKeyPosition =
    parent.type === "Property" ||
    parent.type === "PropertyDefinition" ||
    parent.type === "MethodDefinition" ||
    parent.type === "TSPropertySignature" ||
    parent.type === "TSMethodSignature";

  return isKeyPosition && parent.key === node;
}

/**
 * True when the string is compared to a `typeof` expression
 * (either `typeof x === "string"` or `"string" === typeof x`).
 */
export function isTypeofComparison(node: ASTNode): boolean {
  const parent = node.parent;
  if (!parent || parent.type !== "BinaryExpression" || !EQUALITY_OPERATORS.has(parent.operator ?? "")) {
    return false;
  }
  const other = parent.left === node ? parent.right : parent.left;
  return other?.type === "UnaryExpression" && other.operator === "typeof";
}

// ---------------------------------------------------------------------------
// Metadata-aware predicates — the string is paired with a known metadata key
// ---------------------------------------------------------------------------

/** True when the string is the value of a property whose key is in METADATA_KEYS. */
export function isMetadataPropertyValue(node: ASTNode): boolean {
  const parent = node.parent;
  if (!parent || parent.type !== "Property" || parent.value !== node) {
    return false;
  }
  const keyName = getPropertyName(parent.key);
  return keyName !== null && METADATA_KEYS.has(keyName);
}

/** True when the string is compared (===, !==, ==, !=) to a metadata property. */
export function isComparedToMetadataProperty(node: ASTNode): boolean {
  const parent = node.parent;
  if (!parent || parent.type !== "BinaryExpression" || !EQUALITY_OPERATORS.has(parent.operator ?? "")) {
    return false;
  }
  const other = parent.left === node ? parent.right : parent.left;
  const name = getPropertyName(other);
  return name !== null && METADATA_KEYS.has(name);
}

/** True when the string is a `case` value in a switch over a metadata property. */
export function isSwitchCaseOnMetadata(node: ASTNode): boolean {
  const parent = node.parent;
  if (!parent || parent.type !== "SwitchCase" || parent.test !== node) {
    return false;
  }
  const switchStmt = parent.parent;
  if (!switchStmt || switchStmt.type !== "SwitchStatement") {
    return false;
  }
  const name = getPropertyName(switchStmt.discriminant);
  return name !== null && METADATA_KEYS.has(name);
}

/** True when the string is assigned to a DOM or metadata property (e.g. `el.className = "foo"`). */
export function isAssignedToKnownProperty(node: ASTNode): boolean {
  const parent = node.parent;
  if (!parent || parent.type !== "AssignmentExpression" || parent.right !== node) {
    return false;
  }
  const name = getPropertyName(parent.left);
  return name !== null && (DOM_PROPERTIES.has(name) || METADATA_KEYS.has(name));
}
