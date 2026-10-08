import { assertMessage, word } from "../core/checks";
import { described } from "../core/describe";
import { assertList, issue } from "../core/result";
import type { AsyncCheck, Message, ValidationIssue } from "../core/types";
import type { GlobalFile } from "../primitives/file";

/**
 * The first bytes of each media type `contentType` knows, from the specification of each format, with
 * `undefined` for a byte that may be anything, such as the size a WebP file writes after `RIFF`. A type has
 * more than one when its format has more than one version.
 */
const SIGNATURES: Readonly<Record<string, readonly (readonly (number | undefined)[])[]>> = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  "image/webp": [[0x52, 0x49, 0x46, 0x46, undefined, undefined, undefined, undefined, 0x57, 0x45, 0x42, 0x50]],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46, 0x2d]],
};

/** How many bytes are read from the start of a file: as many as the longest signature. */
const READ_LENGTH = 12;

/** Tests whether bytes start with a signature, `undefined` matching any byte. */
const matches = (bytes: Uint8Array, signature: readonly (number | undefined)[]): boolean =>
  signature.every((byte, index) => (byte === undefined ? index < bytes.length : bytes[index] === byte));

/**
 * Creates a check for `file` that reads the first bytes of the file and passes when they are those of one
 * of the media types given, whatever type the file declares.
 *
 * @remarks
 * The type a file declares is whatever the client said, so a `types` option alone lets through a script
 * named `photo.png`. This reads what the file holds instead, as far as its first bytes tell: the signature
 * of a format, not proof that the rest of it is well formed, so a program that decodes the file still
 * handles a file it cannot decode. It knows `image/png`, `image/jpeg`, `image/gif`, `image/webp` and
 * `application/pdf`. Reading is asynchronous, so a `file` given it is an `AsyncValidator`, and it runs once
 * every option of the `file` passed, so `maxSize` refuses a large file before it is read. A file that does
 * not match is one `invalid_value` issue, `{ options, content: true }`, and one that cannot be read, such as
 * a file removed from the disk, `{ unreadable: true }`; neither holds a byte of it.
 *
 * @example
 * ```ts
 * const avatar = file({ maxSize: 1_000_000 }, contentType(["image/png", "image/jpeg"]));
 * await avatar(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "me.png")); // { ok: true, value: File }
 * await avatar(new File(["<script>"], "me.png", { type: "image/png" })); // { ok: false, ... }
 * ```
 *
 * @param types - The media types the content may be, each one this check knows.
 * @param message - Text or a function for the issue it reports, in place of the map's wording.
 * @returns An asynchronous check for `file`.
 * @throws {TypeError} When `types` is not a list, holds a type the check does not know, or `message` is
 * neither text nor a function.
 * @throws {RangeError} When `types` is empty.
 */
export function contentType(types: readonly string[], message?: Message): AsyncCheck<GlobalFile> {
  assertList("types", types, "media types");
  if (types.length === 0) {
    throw new RangeError("types must name at least one media type, since no content is none of them");
  }
  for (const type of types) {
    if (typeof type !== "string" || !Object.hasOwn(SIGNATURES, type)) {
      throw new TypeError(
        `types must hold media types contentType knows, ${Object.keys(SIGNATURES).join(", ")}, received ${JSON.stringify(type)}`,
      );
    }
  }
  assertMessage(message);
  const allowed = Object.freeze([...types]);
  const signatures = allowed.flatMap((type) => SIGNATURES[type] ?? []);
  const fail = (params: Readonly<Record<string, unknown>>): ValidationIssue[] =>
    word([issue("invalid_value", params)], message);
  return described<AsyncCheck<GlobalFile>>(
    async (value) => {
      let bytes: Uint8Array;
      try {
        // The built-in methods, so the file read is the one `file` checked and not a method it was given.
        const start = Blob.prototype.slice.call(value as unknown as Blob, 0, READ_LENGTH);
        bytes = new Uint8Array(await Blob.prototype.arrayBuffer.call(start));
      } catch {
        return fail({ unreadable: true });
      }
      return signatures.some((signature) => matches(bytes, signature))
        ? undefined
        : fail({ options: allowed, content: true });
    },
    { kind: "check", code: "invalid_value", params: Object.freeze({ options: allowed, content: true }) },
  );
}
