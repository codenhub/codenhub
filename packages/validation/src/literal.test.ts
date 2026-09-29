import { describe, expect, it } from "vitest";

import { val } from "./index";
import { issuesOf, messagesOf, valueOf } from "./test-utils";

describe("literal", () => {
  it("accepts exactly one value of any primitive kind", () => {
    expect(val.literal("a").validate("a").ok).toBe(true);
    expect(val.literal("a").validate("b").ok).toBe(false);
    expect(val.literal(1).validate("1").ok).toBe(false);
    expect(val.literal(1n).validate(1n).ok).toBe(true);
    expect(val.literal(true).validate(true).ok).toBe(true);
    expect(val.literal(null).validate(null).ok).toBe(true);
    expect(val.literal(undefined).validate(undefined).ok).toBe(true);
  });

  it("names the expected value in the message and params", () => {
    const [issue] = issuesOf(val.literal("a").validate("b"));
    expect(issue).toMatchObject({ message: 'Expected "a"', params: { expected: "a" } });
  });

  it("exposes its value", () => {
    expect(val.literal("a").value).toBe("a");
  });
});

describe("enum", () => {
  it("accepts one of the listed strings or numbers", () => {
    const role = val.enum(["admin", "user"]);
    expect(role.validate("admin").ok).toBe(true);
    expect(messagesOf(role.validate("root"))).toEqual(['Expected one of "admin", "user"']);
    expect(val.enum([1, 2]).validate(2).ok).toBe(true);
    expect(val.enum([1, 2]).validate("2").ok).toBe(false);
  });

  it("lists its values", () => {
    expect(val.enum(["a", "b"]).values).toEqual(["a", "b"]);
  });
});

describe("nativeEnum", () => {
  it("accepts the values of a string enum", () => {
    enum Color {
      Red = "red",
      Blue = "blue",
    }
    const schema = val.nativeEnum(Color);
    expect(valueOf(schema.validate("red"))).toBe(Color.Red);
    expect(schema.validate("Red").ok).toBe(false);
  });

  it("accepts numeric enum values but not their reverse-mapped names", () => {
    enum Level {
      Low,
      High,
    }
    const schema = val.nativeEnum(Level);
    expect(schema.validate(1).ok).toBe(true);
    expect(schema.validate("High").ok).toBe(false);
    expect(schema.validate("Low").ok).toBe(false);
  });

  it("accepts an as const object", () => {
    const schema = val.nativeEnum({ A: "a", B: "b" } as const);
    expect(schema.validate("a").ok).toBe(true);
    expect(schema.validate("A").ok).toBe(false);
  });
});
