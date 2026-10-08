import { describe, expect, expectTypeOf, it } from "vitest";

import { check } from "../builders/check";
import { contentType } from "../checks/content-type";
import { audit } from "../core/audit";
import { describe as describeValidator } from "../core/describe";
import type { Infer, InferInput, ValidationResult } from "../core/types";
import { toJsonSchema } from "../interop/json-schema";
import { formatIssue } from "../messages/format-issue";
import { file } from "../primitives/file";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { accepts, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { encode } from "./encode";
import { formData } from "./form-data";
import { object } from "./object";
import { optional } from "./optional";

const form = (...entries: [string, string | File][]): FormData => {
  const data = new FormData();
  for (const [key, value] of entries) {
    data.append(key, value);
  }
  return data;
};

describe("formData", () => {
  it("should read each field as text or a file and produce what the validator makes of them", () => {
    const avatar = new File(["x"], "me.txt", { type: "text/plain" });
    const signup = formData(object({ name: string({ min: 2 }), avatar: optional(file({ maxSize: 10 })) }));
    expect(valueOf(signup(form(["name", "Ada"], ["avatar", avatar])))).toEqual({ name: "Ada", avatar });
    expect(valueOf(signup(form(["name", "Ada"])))).toEqual({ name: "Ada" });
    expect(issuesOf(signup(form(["name", "A"])))[0]).toMatchObject({ code: "too_small", path: ["name"] });
  });

  it("should refuse a key given twice unless repeated, and then give every key a list", () => {
    const one = formData(object({ tag: string() }));
    expect(issuesOf(one(form(["tag", "a"], ["tag", "b"])))).toEqual([
      {
        code: "invalid_key",
        path: ["tag"],
        params: { issues: [{ code: "invalid_value", path: [], params: { unique: true } }] },
      },
    ]);
    const many = formData(object({ tag: array(string(), { max: 5 }) }), { repeated: true });
    expect(valueOf(many(form(["tag", "a"], ["tag", "b"])))).toEqual({ tag: ["a", "b"] });
    expect(valueOf(many(form(["tag", "a"])))).toEqual({ tag: ["a"] });
  });

  it("should refuse what is not a FormData, a URLSearchParams or an object that claims to be one included", () => {
    const fields = formData(unknown());
    const claims = { [Symbol.toStringTag]: "FormData", entries: () => [][Symbol.iterator]() };
    expect(accepts(fields, new URLSearchParams("a=1"), "a=1", { a: "1" }, claims, null, [["a", "1"]])).toEqual(
      Array(6).fill(false),
    );
    const [found] = issuesOf(fields({ a: "1" }));
    expect(found).toEqual({ code: "invalid_type", path: [], params: { expected: "form data", received: "object" } });
    expect(formatIssue(found as never)).toBe("Expected form data, received object");
  });

  it("should read a key such as __proto__ as a field", () => {
    const value = valueOf(formData(unknown())(form(["__proto__", "x"]))) as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
  });

  it("should wait for a validator that waits, and run its checks on what the validator produced", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "a.png");
    const upload = formData(
      object({ photo: file({ maxSize: 100 }, contentType(["image/png"])) }),
      check((value) => value.photo.size > 0, { message: "Empty" }),
    );
    expect((await upload(form(["photo", png]))).ok).toBe(true);
    expect(issuesOf(await upload(form(["photo", new File(["%PDF-"], "a.png")])))[0]).toMatchObject({
      path: ["photo"],
      params: { content: true },
    });
  });

  it("should be typed from the validator, and take the runtime's FormData", () => {
    const signup = formData(object({ name: string(), avatar: file() }));
    expectTypeOf<Infer<typeof signup>>().toEqualTypeOf<{ name: string; avatar: File }>();
    expectTypeOf<InferInput<typeof signup>>().toEqualTypeOf<FormData>();
    expectTypeOf(formData(object({ photo: file(contentType(["image/png"])) }))).returns.toEqualTypeOf<
      ValidationResult<{ photo: File }> | PromiseLike<ValidationResult<{ photo: File }>>
    >();
  });

  it("should be described, audited through what it holds, and refused by JSON Schema and encode", () => {
    const signup = formData(object({ avatar: file() }), { repeated: true });
    expect(describeValidator(signup)).toMatchObject({ kind: "formData", options: { repeated: true } });
    expect(audit(signup)).toEqual([{ rule: "unbounded_size", path: "avatar", kind: "file" }]);
    expect(() => toJsonSchema(signup)).toThrow(TypeError);
    expect(() => encode(signup, { avatar: new File([], "a") })).toThrow(TypeError);
  });

  it("should refuse options and validators that are not what they say", () => {
    expect(() => formData("object" as never)).toThrow(TypeError);
    expect(() => formData(unknown(), { repeated: "yes" as never })).toThrow(TypeError);
    expect(() => formData(unknown(), { max: 1 } as never)).toThrow(TypeError);
  });
});
