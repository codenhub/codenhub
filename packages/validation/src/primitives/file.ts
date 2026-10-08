import { leaf, split } from "../core/checks";
import { described } from "../core/describe";
import { fileOf } from "../core/objects";
import { assertList, assertOrder, assertSize, issue } from "../core/result";
import type { Factory, MessageOptions } from "../core/types";

/**
 * The members of a `File` that are the same in every runtime, which is what `file` produces for a program
 * compiled without the types of the DOM or of Node.js.
 */
interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * The runtime's own `File`, read from `globalThis` so that a public signature names no global, which a
 * program compiled without the types of the DOM or of Node.js could not resolve; {@link FileLike} for one.
 */
export type GlobalFile = typeof globalThis extends { File: { prototype: infer TFile } } ? TFile : FileLike;

/** Options for {@link file}. */
export interface FileOptions extends MessageOptions {
  /** Requires at least this many bytes. A non-negative integer. */
  minSize?: number | undefined;
  /**
   * Allows at most this many bytes. A non-negative integer. A file is held in memory by whoever read the
   * form, so `audit` reports a `file` without one.
   */
  maxSize?: number | undefined;
  /**
   * The media types the file may declare, such as `["image/png", "image/jpeg"]`, compared without letter
   * case and without parameters such as `;charset=utf-8`. The client chooses what it declares, so this says
   * nothing of the content: `contentType` reads that.
   */
  types?: readonly string[] | undefined;
}

/** A media type as RFC 6838 names one: a type and a subtype of letters, digits and a few marks. */
const MEDIA_TYPE_PATTERN = /^[a-z0-9][\w!#$&^.+-]*\/[a-z0-9][\w!#$&^.+-]*$/i;

/** A declared media type without its parameters or letter case, as `types` compares it. */
const essenceOf = (type: string): string => (type.split(";")[0] as string).trim().toLowerCase();

/** Reads the `types` option into the lowercase types it allows, frozen, or undefined for no option. */
const readTypes = (types: readonly string[] | undefined): readonly string[] | undefined => {
  if (types === undefined) {
    return undefined;
  }
  assertList("types", types, "media types");
  if (types.length === 0) {
    throw new RangeError("types must name at least one media type, since no file declares none of them");
  }
  for (const type of types) {
    if (typeof type !== "string" || !MEDIA_TYPE_PATTERN.test(type)) {
      throw new TypeError(`types must hold media types such as "image/png", received ${JSON.stringify(type)}`);
    }
  }
  return Object.freeze(types.map((type) => type.toLowerCase()));
};

/**
 * Creates a validator for a `File`, such as one a form sends, from this realm or another, such as an iframe.
 *
 * @remarks
 * A `Blob` is no file, since a form sends a file with its name, and an object that only claims to be one
 * is not one either. `minSize` and `maxSize` bound its size in bytes, each failing one reporting its own
 * issue, with `type: "file"`. `types` checks the media type it declares, which the client chooses freely:
 * to check what it holds, add the `contentType` check. The value is the file itself; its content is never
 * read, and no issue holds its name, its type or its content.
 *
 * `GlobalFile`, the type it produces, is the runtime's `File`: the DOM's or Node.js's where the program
 * is compiled with their types, and otherwise an object with the `name`, `size`, `type`, `lastModified` and
 * `arrayBuffer` every runtime's `File` has.
 *
 * @example
 * ```ts
 * const avatar = file({ maxSize: 1_000_000, types: ["image/png", "image/jpeg"] });
 * avatar(new File(["..."], "me.png", { type: "image/png" })); // { ok: true, value: File }
 * avatar("me.png"); // { ok: false, error: { issues: [{ code: "invalid_type", ... }] } }
 * file({ maxSize: 1_000_000 }, contentType(["image/png"])); // an AsyncValidator, which reads the first bytes
 * ```
 *
 * @throws {RangeError} When `minSize` or `maxSize` is not a non-negative integer, `minSize` is above
 * `maxSize`, or `types` is empty.
 * @throws {TypeError} When `minSize` or `maxSize` is not a number, `types` is not a list of media types, or a
 * check is not a function.
 */
export const file = ((...args: unknown[]) => {
  const [options, checks] = split<FileOptions, GlobalFile>(args, "minSize maxSize types");
  const { minSize, maxSize, message } = options;
  if (minSize !== undefined) {
    assertSize("Minimum size", minSize);
  }
  if (maxSize !== undefined) {
    assertSize("Maximum size", maxSize);
  }
  assertOrder("minSize", minSize, "maxSize", maxSize);
  const types = readTypes(options.types);
  const validator = leaf<GlobalFile>(
    "file",
    (input) => fileOf(input) !== undefined,
    message,
    checks,
    (value, issues) => {
      const { size, type } = fileOf(value) as { size: number; type: string };
      if (minSize !== undefined && size < minSize) {
        issues.push(issue("too_small", { minimum: minSize, type: "file" }));
      }
      if (maxSize !== undefined && size > maxSize) {
        issues.push(issue("too_big", { maximum: maxSize, type: "file" }));
      }
      if (types !== undefined && !types.includes(essenceOf(type))) {
        issues.push(issue("invalid_value", { options: types, type: "file" }));
      }
      return value;
    },
  );
  return described(validator, { kind: "file", options, checks });
}) as Factory<GlobalFile, FileOptions>;
