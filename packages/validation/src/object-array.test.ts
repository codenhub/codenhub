import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

describe("object and array combinators", () => {
  it("accepts plain objects and null-prototype objects in object schema", () => {
    const plain = { email: "user@example.com" };
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    nullPrototype.email = "user@example.com";

    const schema = val.object({ email: val.string() });
    expect(schema.validate(plain)).toEqual({ ok: true, value: { email: "user@example.com" } });
    expect(schema.validate(nullPrototype)).toEqual({ ok: true, value: { email: "user@example.com" } });
  });

  it("validates arrays of objects with nested path tracking", () => {
    const userListSchema = val.array(
      val.object({
        id: val.number(),
        name: val.string().min(2),
      }),
    );

    const validList = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];
    expect(userListSchema.validate(validList)).toEqual({
      ok: true,
      value: validList,
    });

    const invalidList = [
      { id: 1, name: "Alice" },
      { id: 2, name: "B" },
    ];
    const res = userListSchema.validate(invalidList) as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.path).toEqual([1, "name"]);
    expect(res.error.code).toBe("too_small");
  });

  it("validates objects with nested arrays and length constraints", () => {
    const postSchema = val.object({
      title: val.string(),
      tags: val.array(val.string()).min(1).max(3),
    });

    expect(
      postSchema.validate({
        title: "Hello World",
        tags: ["ts", "validation"],
      }),
    ).toEqual({
      ok: true,
      value: {
        title: "Hello World",
        tags: ["ts", "validation"],
      },
    });

    const emptyTags = postSchema.validate({
      title: "Hello World",
      tags: [],
    }) as ValidationErr;
    expect(emptyTags.ok).toBe(false);
    expect(emptyTags.error.path).toEqual(["tags"]);
    expect(emptyTags.error.code).toBe("too_small");
  });

  it("rejects non-array inputs for array schemas", () => {
    const schema = val.array(val.string());
    const res = schema.validate("not an array") as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("invalid_type");
  });

  it("rejects non-object inputs for object schemas", () => {
    const schema = val.object({ id: val.number() });
    const res = schema.validate([1, 2, 3]) as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("invalid_type");
  });
});
