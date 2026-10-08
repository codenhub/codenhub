import { describe, expect, expectTypeOf, it } from "vitest";

import { contentType } from "../checks/content-type";
import { encode } from "../composition/encode";
import { object } from "../composition/object";
import { optional } from "../composition/optional";
import { audit } from "../core/audit";
import { describe as describeValidator } from "../core/describe";
import type { Infer, InferInput, ValidationResult } from "../core/types";
import { toJsonSchema } from "../interop/json-schema";
import { formatIssue } from "../messages/format-issue";
import { portugueseMessages } from "../messages/portuguese-messages";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { file } from "./file";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const GIF87 = [..."GIF87a"].map((letter) => letter.charCodeAt(0));
const GIF89 = [..."GIF89a"].map((letter) => letter.charCodeAt(0));
const WEBP = [..."RIFF"]
  .map((letter) => letter.charCodeAt(0))
  .concat(
    [1, 2, 3, 4],
    [..."WEBP"].map((l) => l.charCodeAt(0)),
  );
const PDF = [..."%PDF-1.7"].map((letter) => letter.charCodeAt(0));

const bytes = (values: readonly number[], name = "upload", type = ""): File =>
  new File([new Uint8Array(values)], name, { type });
const sized = (size: number, type = ""): File => new File(["x".repeat(size)], "upload.txt", { type });

describe("file", () => {
  it("should accept a File and return the same one", () => {
    const given = sized(3, "text/plain");
    expect(valueOf(file()(given))).toBe(given);
  });

  it("should reject a Blob, an object that claims to be a file, and anything else", () => {
    const claims = { [Symbol.toStringTag]: "File", name: "a.png", size: 1, type: "image/png" };
    expect(accepts(file(), new Blob(["x"]), claims, {}, "a.png", null, undefined, [])).toEqual(Array(7).fill(false));
    expect(issuesOf(file()(new Blob(["x"])))[0]).toEqual({
      code: "invalid_type",
      path: [],
      params: { expected: "file", received: "object" },
    });
  });

  it("should bound the size in bytes, inclusive, each bound reporting its own issue", () => {
    const window = file({ minSize: 2, maxSize: 4 });
    expect(accepts(window, sized(1), sized(2), sized(4), sized(5))).toEqual([false, true, true, false]);
    expect(issuesOf(window(sized(1)))[0]).toEqual({
      code: "too_small",
      path: [],
      params: { minimum: 2, type: "file" },
    });
    expect(issuesOf(window(sized(5)))[0]).toEqual({ code: "too_big", path: [], params: { maximum: 4, type: "file" } });
  });

  it("should compare the declared type without letter case or parameters", () => {
    const text = file({ types: ["text/plain", "Image/PNG"] });
    expect(accepts(text, sized(1, "text/plain"), sized(1, "text/plain;charset=utf-8"), sized(1, "image/png"))).toEqual([
      true,
      true,
      true,
    ]);
    expect(accepts(text, sized(1, "image/jpeg"), sized(1, ""))).toEqual([false, false]);
  });

  it("should report a declared type it does not allow with the types it allows, and never the file's own", () => {
    const issues = issuesOf(file({ types: ["image/png"] })(new File(["x"], "secret-name.gif", { type: "image/gif" })));
    expect(issues).toEqual([{ code: "invalid_value", path: [], params: { options: ["image/png"], type: "file" } }]);
    expect(JSON.stringify(issues)).not.toMatch(/secret-name|image\/gif/);
  });

  it("should report every option that fails", () => {
    expect(codesOf(file({ maxSize: 1, types: ["image/png"] })(sized(2, "text/plain")))).toEqual([
      "too_big",
      "invalid_value",
    ]);
  });

  it("should word its issues in bytes and with the types it allows", () => {
    const [small] = issuesOf(file({ minSize: 2 })(sized(1)));
    const [big] = issuesOf(file({ maxSize: 1 })(sized(2)));
    const [type] = issuesOf(file({ types: ["image/png", "image/jpeg"] })(sized(1, "text/plain")));
    expect([small, big, type].map((issue) => formatIssue(issue as never))).toEqual([
      "Must be at least 2 bytes",
      "Must be at most 1 byte",
      'Expected one of "image/png", "image/jpeg"',
    ]);
    expect([small, big].map((issue) => formatIssue(issue as never, portugueseMessages))).toEqual([
      "Deve ter no mínimo 2 bytes",
      "Deve ter no máximo 1 byte",
    ]);
  });

  it("should refuse options no file can satisfy, or that are not what they say", () => {
    expect(() => file({ minSize: -1 })).toThrow(RangeError);
    expect(() => file({ maxSize: 1.5 })).toThrow(RangeError);
    expect(() => file({ minSize: 3, maxSize: 2 })).toThrow(RangeError);
    expect(() => file({ types: [] })).toThrow(RangeError);
    expect(() => file({ maxSize: "1" as never })).toThrow(TypeError);
    expect(() => file({ types: "image/png" as never })).toThrow(TypeError);
    expect(() => file({ types: ["png"] })).toThrow(TypeError);
    expect(() => file({ types: [1 as never] })).toThrow(TypeError);
    expect(() => file({ size: 1 } as never)).toThrow(TypeError);
  });

  it("should be typed as the runtime's File", () => {
    const avatar = file();
    expectTypeOf<Infer<typeof avatar>>().toEqualTypeOf<File>();
    expectTypeOf<InferInput<typeof avatar>>().toEqualTypeOf<File>();
    expectTypeOf(file(contentType(["image/png"]))).returns.toEqualTypeOf<
      ValidationResult<File> | PromiseLike<ValidationResult<File>>
    >();
  });

  it("should be described, written back as it is, refused by JSON Schema, and audited for its size", () => {
    const given = sized(1);
    expect(describeValidator(file({ maxSize: 1 }))).toMatchObject({ kind: "file", options: { maxSize: 1 } });
    expect(valueOf(encode(file(), given) as ValidationResult<File>)).toBe(given);
    expect(() => toJsonSchema(file())).toThrow(TypeError);
    expect(audit(object({ avatar: optional(file()) }))).toEqual([
      { rule: "unbounded_size", path: "avatar", kind: "file" },
    ]);
    expect(audit(object({ avatar: optional(file({ maxSize: 1 })) }))).toEqual([]);
  });

  it("should give the same answer with and without the fast path of an object", () => {
    const form = object({ avatar: file({ maxSize: 2, types: ["text/plain"] }) });
    expect(
      accepts(form, { avatar: sized(1, "text/plain") }, { avatar: sized(3, "text/plain") }, { avatar: "x" }),
    ).toEqual([true, false, false]);
  });
});

describe("contentType", () => {
  const each = [
    ["image/png", PNG],
    ["image/jpeg", JPEG],
    ["image/gif", GIF87],
    ["image/gif", GIF89],
    ["image/webp", WEBP],
    ["application/pdf", PDF],
  ] as const;

  it.each(each)("should pass %s by its first bytes, whatever the file declares", async (type, content) => {
    expect((await file(contentType([type]))(bytes(content, "x.txt", "text/plain"))).ok).toBe(true);
  });

  it("should fail content of another type, or too short to tell, without a byte of it in the issue", async () => {
    const check = file(contentType(["image/png", "image/jpeg"]));
    const contents = [GIF89, PDF, PNG.slice(0, 7), [], [..."<script>"].map((l) => l.charCodeAt(0))];
    const results = await Promise.all(contents.map((content) => check(bytes(content, "photo.png", "image/png"))));
    for (const result of results) {
      expect(issuesOf(result)).toEqual([
        { code: "invalid_value", path: [], params: { options: ["image/png", "image/jpeg"], content: true } },
      ]);
    }
    expect(
      issuesOf(await file(contentType(["image/webp"]))(bytes([...WEBP.slice(0, 4), 1, 2, 3, 4, 0, 0, 0, 0]))),
    ).toHaveLength(1);
  });

  it("should report what it cannot read as unreadable", async () => {
    expect(await contentType(["image/png"])({} as never)).toEqual([
      { code: "invalid_value", path: [], params: { unreadable: true } },
    ]);
  });

  it("should not read a file the options of the file refused", async () => {
    const read = Blob.prototype.arrayBuffer;
    let reads = 0;
    Blob.prototype.arrayBuffer = function (this: Blob) {
      reads += 1;
      return read.call(this);
    };
    try {
      expect(codesOf(await file({ maxSize: 4 }, contentType(["image/png"]))(bytes(PNG)))).toEqual(["too_big"]);
      expect(reads).toBe(0);
      await file(contentType(["image/png"]))(bytes(PNG));
      expect(reads).toBe(1);
    } finally {
      Blob.prototype.arrayBuffer = read;
    }
  });

  it("should take a message of its own", async () => {
    const [found] = issuesOf(await file(contentType(["image/png"], "Upload a PNG"))(bytes(PDF)));
    expect(found?.message).toBe("Upload a PNG");
  });

  it("should refuse types it does not know, and a list that is empty or no list", () => {
    expect(() => contentType([])).toThrow(RangeError);
    expect(() => contentType(["image/svg+xml"])).toThrow(
      /image\/png, image\/jpeg, image\/gif, image\/webp, application\/pdf/,
    );
    expect(() => contentType(["IMAGE/PNG"])).toThrow(TypeError);
    expect(() => contentType("image/png" as never)).toThrow(TypeError);
    expect(() => contentType(["image/png"], 5 as never)).toThrow(TypeError);
  });

  it("should be described as a check", () => {
    expect(describeValidator(contentType(["image/png"]))).toEqual({
      kind: "check",
      code: "invalid_value",
      params: { options: ["image/png"], content: true },
    });
  });
});
