import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { guard } from "../builders/guard";
import { endsWith } from "../checks/ends-with";
import { includes } from "../checks/includes";
import { lowercase } from "../checks/lowercase";
import { multipleOf } from "../checks/multiple-of";
import { nonBlank } from "../checks/non-blank";
import { nonZero } from "../checks/non-zero";
import { pattern } from "../checks/pattern";
import { startsWith } from "../checks/starts-with";
import { unique } from "../checks/unique";
import { coerceBigint } from "../coercion/coerce-bigint";
import { coerceBoolean } from "../coercion/coerce-boolean";
import { coerceDate } from "../coercion/coerce-date";
import { coerceNumber } from "../coercion/coerce-number";
import { array } from "../composition/array";
import { fallback } from "../composition/fallback";
import { intersection } from "../composition/intersection";
import { json } from "../composition/json";
import { lazy } from "../composition/lazy";
import { nullable } from "../composition/nullable";
import { nullish } from "../composition/nullish";
import { object } from "../composition/object";
import { optional } from "../composition/optional";
import { pipe } from "../composition/pipe";
import { record } from "../composition/record";
import { set } from "../composition/set";
import { tagged } from "../composition/tagged";
import { transform } from "../composition/transform";
import { tuple } from "../composition/tuple";
import { union } from "../composition/union";
import type { AnyValidator, Validator } from "../core/types";
import { base64 } from "../formats/base64";
import { datetime } from "../formats/datetime";
import { email } from "../formats/email";
import { ip } from "../formats/ip";
import { port } from "../formats/port";
import { searchParams } from "../formats/search-params";
import { slug } from "../formats/slug";
import { url } from "../formats/url";
import { uuid } from "../formats/uuid";
import { bigint } from "../primitives/bigint";
import { boolean } from "../primitives/boolean";
import { date } from "../primitives/date";
import { literal } from "../primitives/literal";
import { never } from "../primitives/never";
import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { toJsonSchema, type JsonSchemaOptions } from "./json-schema";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/** The schema without the `$schema` every one starts with. */
const schemaOf = (validator: AnyValidator, options?: JsonSchemaOptions): Record<string, unknown> => {
  const { $schema, ...schema } = toJsonSchema(validator, options);
  expect($schema).toBe(DRAFT);
  return schema;
};

describe("toJsonSchema", () => {
  it("should write an object with its properties, the required ones, and the draft it is written in", () => {
    const user = object({ name: string({ min: 2 }), email: email(), age: optional(number({ int: true })) });
    expect(toJsonSchema(user)).toEqual({
      $schema: DRAFT,
      type: "object",
      properties: {
        name: { type: "string", minLength: 2 },
        email: { type: "string", format: "email" },
        age: { type: "integer" },
      },
      required: ["name", "email"],
    });
  });

  it("should write the bounds of strings and numbers", () => {
    expect(schemaOf(string({ min: 1, max: 5 }))).toEqual({ type: "string", minLength: 1, maxLength: 5 });
    expect(schemaOf(string({ length: 3 }))).toEqual({ type: "string", minLength: 3, maxLength: 3 });
    expect(schemaOf(number({ min: 0, lt: 10 }))).toEqual({ type: "number", minimum: 0, exclusiveMaximum: 10 });
    expect(schemaOf(number({ gt: 0, max: 1, safeInt: true }))).toEqual({
      type: "integer",
      exclusiveMinimum: 0,
      maximum: 1,
    });
    expect(schemaOf(boolean())).toEqual({ type: "boolean" });
    expect(schemaOf(unknown())).toEqual({});
    expect(schemaOf(never())).toEqual({ not: {} });
  });

  it("should write the checks JSON Schema has words for", () => {
    expect(schemaOf(string(pattern(/^[a-z]+$/u)))).toEqual({ type: "string", pattern: "^[a-z]+$" });
    expect(schemaOf(string(startsWith("a.b"), endsWith("/z"), includes("-"), nonBlank()))).toEqual({
      type: "string",
      pattern: String.raw`^a\.b`,
      allOf: [{ pattern: String.raw`\/z$` }, { pattern: String.raw`\-` }, { pattern: String.raw`\S` }],
    });
    expect(schemaOf(number(multipleOf(5), nonZero()))).toEqual({ type: "number", multipleOf: 5, not: { const: 0 } });
    expect(schemaOf(array(string(), { min: 1, max: 3 }, unique()))).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
    });
  });

  it("should write a pattern a schema reads as the check does, so one a prefix made matches that text only", () => {
    const { pattern: written } = schemaOf(string(startsWith("a.b|c")));
    expect(new RegExp(written as string, "u").test("a.b|c!")).toBe(true);
    expect(new RegExp(written as string, "u").test("axb")).toBe(false);
  });

  it("should write fixed values", () => {
    expect(schemaOf(literal("a"))).toEqual({ const: "a" });
    expect(schemaOf(literal(null))).toEqual({ const: null });
    expect(schemaOf(oneOf(["a", 1, true]))).toEqual({ enum: ["a", 1, true] });
  });

  it("should write formats under the name JSON Schema gives them, and any other under its own", () => {
    expect(schemaOf(url())).toEqual({ type: "string", format: "uri" });
    expect(schemaOf(uuid())).toEqual({ type: "string", format: "uuid" });
    expect(schemaOf(datetime())).toEqual({ type: "string", format: "date-time" });
    expect(schemaOf(slug())).toEqual({ type: "string", format: "slug" });
    expect(schemaOf(ip({ version: "v6" }))).toEqual({ type: "string", format: "ipv6" });
    expect(schemaOf(ip())).toEqual({ type: "string", anyOf: [{ format: "ipv4" }, { format: "ipv6" }] });
    expect(schemaOf(base64({ url: true }))).toEqual({ type: "string", contentEncoding: "base64url" });
    expect(schemaOf(port())).toEqual({ type: "integer", minimum: 1, maximum: 65_535 });
    expect(schemaOf(email(pattern(/@example\.com$/)))).toEqual({
      type: "string",
      format: "email",
      pattern: String.raw`@example\.com$`,
    });
  });

  it("should write collections", () => {
    expect(schemaOf(tuple([string(), number()]))).toEqual({
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      minItems: 2,
      items: false,
    });
    expect(schemaOf(tuple([string()], { rest: number(), max: 4 }))).toEqual({
      type: "array",
      prefixItems: [{ type: "string" }],
      minItems: 1,
      items: { type: "number" },
      maxItems: 4,
    });
    expect(schemaOf(record(string({ max: 8 }), number(), { max: 10 }))).toEqual({
      type: "object",
      propertyNames: { type: "string", maxLength: 8 },
      additionalProperties: { type: "number" },
      maxProperties: 10,
    });
  });

  it("should write choices", () => {
    expect(schemaOf(union([string(), number()]))).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
    expect(schemaOf(nullable(string()))).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
    expect(schemaOf(intersection(object({ a: string() }), object({ b: number() })))).toEqual({
      allOf: [
        { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
        { type: "object", properties: { b: { type: "number" } }, required: ["b"] },
      ],
    });
  });

  it("should write the tag of a tagged union into each variant, a strict one included", () => {
    const event = tagged("type", {
      click: object({ x: number() }, { unknownKeys: "strict" }),
      key: object({ code: optional(string()) }),
    });
    expect(schemaOf(event)).toEqual({
      oneOf: [
        {
          type: "object",
          properties: { type: { const: "click" }, x: { type: "number" } },
          required: ["type", "x"],
          additionalProperties: false,
        },
        { type: "object", properties: { type: { const: "key" }, code: { type: "string" } }, required: ["type"] },
      ],
    });
  });

  it("should leave out of required every property that may be absent, however it is made so", () => {
    const loose = object({
      a: optional(string()),
      b: nullish(string()),
      c: unknown(),
      d: union([string(), literal(undefined)]),
      e: nullable(optional(string())),
      f: fallback(string(), "x"),
      g: lazy(() => optional(string())),
      h: nullable(string()),
    });
    expect(schemaOf(loose)["required"]).toEqual(["h"]);
  });

  it("should write strict objects as closed, and a key named like a prototype member as a property", () => {
    const strict = object({ ["__proto__"]: string(), constructor: number() }, { unknownKeys: "strict" });
    const schema = schemaOf(strict);
    expect(schema["additionalProperties"]).toBe(false);
    expect(Object.keys(schema["properties"] as object)).toEqual(["__proto__", "constructor"]);
    expect(schema["required"]).toEqual(["__proto__", "constructor"]);
  });

  describe("input and output", () => {
    it("should write a default on the input side, and require the property on the output side", () => {
      const settings = object({ theme: optional(oneOf(["light", "dark"]), "light") });
      expect(schemaOf(settings)).toEqual({
        type: "object",
        properties: { theme: { enum: ["light", "dark"], default: "light" } },
      });
      expect(schemaOf(settings, { io: "output" })).toEqual({
        type: "object",
        properties: { theme: { enum: ["light", "dark"] } },
        required: ["theme"],
      });
    });

    it("should write what a coercion accepts on the input side and what it produces on the output side", () => {
      expect(schemaOf(coerceNumber({ int: true }))).toEqual({ type: ["number", "string"] });
      expect(schemaOf(coerceNumber({ int: true }), { io: "output" })).toEqual({ type: "integer" });
      expect(schemaOf(coerceBoolean())).toEqual({ type: ["boolean", "string", "number"] });
      expect(schemaOf(coerceDate())).toEqual({ type: ["string", "integer"] });
      // What a coercion to a date or a bigint produces has no JSON Schema, so the output side says so.
      expect(() => toJsonSchema(coerceDate(), { io: "output" })).toThrow(TypeError);
      expect(() => toJsonSchema(coerceBigint(), { io: "output" })).toThrow(TypeError);
      expect(schemaOf(coerceDate(), { io: "output", unrepresentable: "any" })).toEqual({});
    });

    it("should write a transform and a pipe by the side asked for", () => {
      const length = transform(string({ min: 1 }), (text) => text.length);
      expect(schemaOf(length)).toEqual({ type: "string", minLength: 1 });
      expect(() => toJsonSchema(length, { io: "output" })).toThrow("what a transform returns at the root");
      const piped = pipe(string(), coerceNumber());
      expect(schemaOf(piped)).toEqual({ type: "string" });
      expect(schemaOf(piped, { io: "output" })).toEqual({ type: "number" });
    });

    it("should write text that holds JSON, a query, and a fallback by the side asked for", () => {
      const body = json(object({ id: number() }));
      const parsed = { type: "object", properties: { id: { type: "number" } }, required: ["id"] };
      expect(schemaOf(body)).toEqual({ type: "string", contentMediaType: "application/json", contentSchema: parsed });
      expect(schemaOf(body, { io: "output" })).toEqual(parsed);
      expect(schemaOf(json())).toEqual({ type: "string", contentMediaType: "application/json", contentSchema: {} });
      expect(schemaOf(searchParams(object({ page: coerceNumber() })))).toEqual({ type: "string" });
      expect(schemaOf(fallback(string(), "x"))).toEqual({});
      expect(schemaOf(fallback(string(), "x"), { io: "output" })).toEqual({ type: "string" });
    });
  });

  describe("recursion", () => {
    interface Tree {
      name: string;
      children: Tree[];
    }
    const tree: Validator<Tree> = object({ name: string(), children: array(lazy(() => tree)) });

    it("should write a recursive schema once, as a definition it refers to", () => {
      const node = {
        type: "object",
        properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/$defs/schema1" } } },
        required: ["name", "children"],
      };
      expect(toJsonSchema(tree)).toEqual({ $schema: DRAFT, ...node, $defs: { schema1: node } });
    });

    it("should write one definition for a schema built anew at each level by the same getter", () => {
      const build = (): AnyValidator => object({ next: optional(lazy(build)) });
      expect(Object.keys(toJsonSchema(build())["$defs"] as object)).toEqual(["schema1"]);
    });

    it("should say so, and not run out of stack, for a getter written anew at each level", () => {
      const build = (): AnyValidator => object({ next: optional(lazy(() => build())) });
      expect(() => toJsonSchema(build())).toThrow("built anew at every level");
    });

    it("should write the values a union and a list of values hold beside undefined", () => {
      expect(schemaOf(union([string(), literal(undefined)]))).toEqual({ anyOf: [{ type: "string" }] });
      expect(schemaOf(oneOf(["a", undefined]))).toEqual({ enum: ["a"] });
    });
  });

  describe("what cannot be written", () => {
    const byHand: Validator<string> = (input) => ({ ok: true, value: String(input) });
    const file = guard("File", (value): value is Date => value instanceof Date);

    it.each([
      ["a validator written by hand", byHand, "a validator written by hand at the root"],
      ["a date", object({ at: date() }), 'a validator of kind "date" at at'],
      ["a bigint", array(bigint()), 'a validator of kind "bigint" at []'],
      ["a set", object({ tags: object({ all: set(string()) }) }), 'a validator of kind "set" at tags.all'],
      ["a guard", file(), "a guard for File at the root"],
      ["a check written by hand", string(check(() => true)), "a check that cannot be read at the root"],
      ["a check with no words", object({ code: string(lowercase()) }), "the check lowercase at code"],
      ["a pattern with flags", string(pattern(/^a/i)), "a pattern with flags at the root"],
      [
        "unique by a key",
        array(
          object({ id: number() }),
          unique((item: { id: number }) => item.id),
        ),
        "at the root",
      ],
      ["a literal JSON lacks", literal(1n), "a literal JSON has no value for at the root"],
      [
        "a check on an object",
        object(
          { a: string() },
          check(() => true),
        ),
        "a check that cannot be read",
      ],
      ["a variant that is no object", tagged("type", { a: lazy(() => object({})) }), "a variant that is not an object"],
    ])("should throw for %s, naming it and its place", (_, validator, message) => {
      expect(() => toJsonSchema(validator as AnyValidator)).toThrow(TypeError);
      expect(() => toJsonSchema(validator as AnyValidator)).toThrow(message);
    });

    it("should accept anything there, and leave a check out, when asked to", () => {
      const any: JsonSchemaOptions = { unrepresentable: "any" };
      expect(schemaOf(object({ at: date(), name: string(lowercase(), pattern(/^a/)) }), any)).toEqual({
        type: "object",
        properties: { at: {}, name: { type: "string", pattern: "^a" } },
        required: ["at", "name"],
      });
      expect(schemaOf(object({ own: byHand }), any)).toEqual({ type: "object", properties: { own: {} } });
    });
  });

  it("should reject options it does not understand", () => {
    expect(() => toJsonSchema(string(), { io: "both" as never })).toThrow('io must be "input" or "output"');
    expect(() => toJsonSchema(string(), { unrepresentable: "skip" as never })).toThrow("unrepresentable must be");
    expect(() => toJsonSchema(string(), [] as never)).toThrow("options must be an object");
    expect(() => toJsonSchema(undefined as never)).toThrow(TypeError);
  });

  it("should give a schema JSON can hold, and a new one each time", () => {
    const user = object({ name: string(), role: optional(oneOf(["admin", "user"]), "user") });
    const schema = toJsonSchema(user);
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    expect(toJsonSchema(user)).not.toBe(schema);
  });
});
