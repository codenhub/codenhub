import { formatFactory } from "./text-format";

const SLUG_CHARACTERS = /^[a-z0-9-]+$/;

/**
 * Words of letters and digits joined by single hyphens, read as its characters and where its hyphens are,
 * since a pattern repeating a word overflowed the stack on a few megabytes of text.
 */
const isSlug = (text: string): boolean =>
  SLUG_CHARACTERS.test(text) && !text.startsWith("-") && !text.endsWith("-") && !text.includes("--");

/**
 * Creates a validator for URL slugs: lowercase ASCII letters and digits in words joined by single
 * hyphens, such as `hello-world-2`. The value is not modified.
 *
 * @example
 * ```ts
 * slug()("hello-world"); // { ok: true, value: "hello-world" }
 * slug()("Hello World"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const slug = /* @__PURE__ */ formatFactory("slug", (text) => (isSlug(text) ? text : undefined));
