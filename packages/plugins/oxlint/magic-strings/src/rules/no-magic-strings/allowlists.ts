// ---------------------------------------------------------------------------
// Allowlists — values in these sets are never treated as magic strings.
// Each set covers a distinct category of commonly inlined literals.
// ---------------------------------------------------------------------------

/** JS/TS primitive type names and language keywords used in typeof checks. */
export const JS_TYPE_NAMES = new Set([
  "string",
  "number",
  "boolean",
  "undefined",
  "object",
  "function",
  "symbol",
  "bigint",
  "null",
  "unknown",
  "any",
  "void",
  "never",
  "default",
  "const",
  "let",
  "var",
  "class",
  "interface",
  "enum",
  "type",
  "module",
]);

/**
 * Property keys whose *values* are descriptive by nature and don't benefit
 * from extraction (e.g. `{ type: "button" }`, `{ variant: "primary" }`).
 */
export const METADATA_KEYS = new Set([
  "type",
  "kind",
  "operator",
  "code",
  "status",
  "state",
  "phase",
  "mode",
  "method",
  "severity",
  "name",
  "tagName",
  "nodeName",
  "className",
  "id",
  "event",
  "key",
  "expected",
  "received",
  "enforce",
  "order",
  "handler",
  "apply",
  "message",
  "messageId",
  "description",
  "summary",
  "label",
  "placeholder",
  "title",
  "text",
  "content",
  "icon",
  "rootClassName",
  "role",
  "position",
  "variant",
  "theme",
  "size",
  "color",
  "align",
  "justify",
  "orientation",
  "url",
  "path",
  "headers",
  "query",
  "params",
  "body",
  "value",
]);

/** HTTP methods, MIME types, encodings — protocol-level constants. */
export const PROTOCOL_CONSTANTS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
  "content-type",
  "authorization",
  "accept",
  "content-length",
  "application/json",
  "text/html",
  "text/plain",
  "application/octet-stream",
  "multipart/form-data",
  "utf8",
  "utf-8",
  "ascii",
  "base64",
  "hex",
  "binary",
]);

/** DOM element properties commonly assigned with inline string values. */
export const DOM_PROPERTIES = new Set([
  "type",
  "className",
  "innerHTML",
  "id",
  "tagName",
  "textContent",
  "innerText",
  "style",
  "role",
  "src",
  "href",
  "rel",
  "target",
  "onload",
  "as",
  "value",
  "placeholder",
]);

/**
 * Method names whose arguments are inherently stringly-typed (DOM APIs,
 * string methods, event emitters, etc.). Strings passed to these methods
 * are considered safe because they represent API-dictated values.
 */
export const SAFE_METHODS = new Set([
  "createElement",
  "setAttribute",
  "getAttribute",
  "removeAttribute",
  "hasAttribute",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "querySelector",
  "querySelectorAll",
  "getElementById",
  "getElementsByClassName",
  "getElementsByTagName",
  "matches",
  "closest",
  "createElementNS",
  "add",
  "remove",
  "toggle",
  "contains",
  "setProperty",
  "getPropertyValue",
  "replace",
  "replaceAll",
  "match",
  "test",
  "startsWith",
  "endsWith",
  "includes",
  "split",
  "join",
  "subscribe",
  "notify",
  "emit",
  "on",
  "off",
  "once",
  "trigger",
  "dispatch",
  "addListener",
  "removeListener",
  "has",
  "get",
  "set",
  "delete",
]);

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Matches HTML/XML markup or attribute-like patterns (e.g. `<div>`, `key="val"`). */
export const MARKUP_PATTERN = /(<[a-zA-Z!/][^>]*>|[a-zA-Z0-9_-]+=(?:"[^"]*"|'[^']*'))/;

/** Matches file extensions like `.ts`, `.json`, `.d.ts`. */
export const FILE_EXT_PATTERN = /^(?:\.[a-zA-Z0-9]{1,4}|\.d\.ts)$/;
