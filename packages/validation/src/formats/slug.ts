import { formatFactory } from "./text-format";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
export const slug = /* @__PURE__ */ formatFactory("slug", (text) => (SLUG_PATTERN.test(text) ? text : undefined));
