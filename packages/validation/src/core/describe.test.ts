import { describe as group, expect, it } from "vitest";

import * as api from "../index";
import type { Description } from "./describe";
import type { AnyValidator, Validator } from "./types";

const {
  array,
  boolean,
  check,
  describe,
  email,
  englishMessages,
  format,
  guard,
  number,
  object,
  optional,
  pattern,
  standard,
  string,
  union,
} = api;

const name = string({ min: 2 });
const slug = format("slug-ish", (text) => /^[a-z-]+$/.test(text));
const byHand: Validator<unknown> = (input) => ({ ok: true, value: input });
const file = guard("File", (value): value is Date => value instanceof Date);

/** One validator of every factory the package exports, with the kind and the parts its description must give. */
const validators: Record<string, [validator: unknown, kind: string, parts?: Record<string, unknown>]> = {
  array: [array(name, { max: 3 }), "array", { item: name, options: { max: 3 } }],
  base64: [api.base64(), "format", { format: "base64" }],
  bigint: [api.bigint({ min: 1n }), "bigint", { options: { min: 1n } }],
  boolean: [boolean(), "boolean", { options: {}, checks: [] }],
  cidr: [api.cidr(), "format", { format: "cidr" }],
  coerceBigint: [api.coerceBigint(), "coerce"],
  coerceBoolean: [api.coerceBoolean(), "coerce"],
  coerceDate: [api.coerceDate(), "coerce"],
  coerceNumber: [api.coerceNumber({ int: true }), "coerce"],
  coerceString: [api.coerceString(), "coerce"],
  creditCard: [api.creditCard(), "format", { format: "creditCard" }],
  cuid2: [api.cuid2(), "format", { format: "cuid2" }],
  date: [api.date(), "date"],
  datetime: [api.datetime({ offset: true }), "format", { format: "datetime", options: { offset: true } }],
  domain: [api.domain(), "format", { format: "domain" }],
  duration: [api.duration(), "format", { format: "duration" }],
  email: [email({ allowPlus: false }), "format", { format: "email", options: { allowPlus: false } }],
  fallback: [api.fallback(name, "none"), "fallback", { inner: name, value: "none" }],
  format: [slug(), "format", { format: "slug-ish" }],
  func: [api.func(), "function"],
  guard: [file(), "guard", { expected: "File" }],
  hex: [api.hex(), "format", { format: "hex" }],
  hostname: [api.hostname(), "format", { format: "hostname" }],
  instanceOf: [api.instanceOf(Date), "instance", { target: Date }],
  intersection: [api.intersection(object({}), object({})), "intersection"],
  ip: [api.ip({ version: "v4" }), "format", { format: "ip", options: { version: "v4" } }],
  isoDate: [api.isoDate(), "format", { format: "isoDate" }],
  json: [api.json(name), "json", { inner: name }],
  jwt: [api.jwt(), "format", { format: "jwt" }],
  codec: [api.codec(name, name, { decode: String, encode: String }), "codec", { input: name, output: name }],
  lazy: [api.lazy(() => name), "lazy"],
  literal: [api.literal("a"), "literal", { value: "a" }],
  mac: [api.mac(), "format", { format: "mac" }],
  map: [api.map(name, number()), "map", { key: name }],
  nanoid: [api.nanoid(), "format", { format: "nanoid" }],
  never: [api.never(), "never"],
  nullable: [api.nullable(name), "nullable", { inner: name }],
  nullish: [api.nullish(name), "nullish", { inner: name }],
  number: [number({ int: true }), "number", { options: { int: true } }],
  object: [
    object({ name }, { unknownKeys: "strict" }),
    "object",
    { shape: { name }, options: { unknownKeys: "strict" } },
  ],
  objectLike: [api.objectLike({ name }), "objectLike", { shape: { name } }],
  oneOf: [api.oneOf(["a", "b"]), "oneOf", { values: ["a", "b"] }],
  optional: [optional(name, "anonymous"), "optional", { inner: name, default: "anonymous" }],
  phone: [api.phone(), "format", { format: "phone" }],
  pipe: [api.pipe(name, email()), "pipe"],
  port: [api.port(), "format", { format: "port" }],
  readonly: [api.readonly(name), "readonly", { inner: name }],
  record: [api.record(name, number()), "record", { key: name }],
  searchParams: [api.searchParams(object({})), "searchParams"],
  semver: [api.semver(), "format", { format: "semver" }],
  set: [api.set(name), "set", { item: name }],
  slug: [api.slug(), "format", { format: "slug" }],
  string: [name, "string", { options: { min: 2 }, checks: [] }],
  symbol: [api.symbol(), "symbol"],
  tagged: [api.tagged("type", { a: object({}) }), "tagged", { key: "type" }],
  time: [api.time(), "format", { format: "time" }],
  transform: [api.transform(name, (text) => text.length), "transform", { inner: name }],
  tuple: [api.tuple([name], { rest: number() }), "tuple", { items: [name] }],
  ulid: [api.ulid(), "format", { format: "ulid" }],
  union: [union([name, number()]), "union"],
  unknown: [api.unknown(), "unknown"],
  url: [api.url(), "format", { format: "url" }],
  uuid: [api.uuid(), "format", { format: "uuid" }],
};

/** One check of every check the package exports that can be read, with the params its description must give. */
const checks: Record<string, [check: unknown, params: Record<string, unknown>]> = {
  endsWith: [api.endsWith("z"), { format: "endsWith", value: "z" }],
  includes: [api.includes("m"), { format: "includes", value: "m" }],
  lowercase: [api.lowercase(), { format: "lowercase" }],
  multipleOf: [api.multipleOf(5), { format: "multipleOf", value: 5 }],
  nonBlank: [api.nonBlank(), { format: "nonBlank" }],
  nonZero: [api.nonZero(), { format: "nonZero" }],
  pattern: [pattern(/^a/i), { format: "regex", pattern: "/^a/i" }],
  startsWith: [api.startsWith("a"), { format: "startsWith", value: "a" }],
  unique: [api.unique(), { unique: true }],
  uppercase: [api.uppercase(), { format: "uppercase" }],
};

/**
 * The exports the tables above do not list: the ones that make no validator, `check`, whose check cannot
 * be read, and the ones that give a validator made of another, which have tests of their own.
 */
const others = new Set([
  "assert",
  "audit",
  "brand",
  "check",
  "checkFields",
  "describe",
  "encode",
  "englishMessages",
  "extend",
  "fail",
  "flatten",
  "formatIssue",
  "formatPath",
  "invalidFormatMessage",
  "invalidIntersectionMessage",
  "invalidKeyMessage",
  "invalidTypeMessage",
  "invalidUnionMessage",
  "invalidValueMessage",
  "is",
  "meta",
  "omit",
  "partial",
  "pick",
  "portugueseMessages",
  "required",
  "pass",
  "standard",
  "standardJsonSchema",
  "toJsonSchema",
  "tooBigMessage",
  "tooSmallMessage",
  "unrecognizedKeyMessage",
]);

group("the description of a validator", () => {
  it("should have a case here for every export, so a new factory cannot go undescribed", () => {
    const covered = [...Object.keys(validators), ...Object.keys(checks), ...others].toSorted();
    expect(covered).toEqual(Object.keys(api).toSorted());
  });

  it.each(Object.entries(validators))("should give the kind and parts of %s", (_, [validator, kind, parts]) => {
    expect(describe(validator as AnyValidator)).toMatchObject({ kind, ...parts });
  });

  it.each(Object.entries(checks))("should give the params of the check %s", (_, [made, params]) => {
    expect(describe(made as AnyValidator)).toMatchObject({ kind: "check", params });
  });

  it("should give a validator's checks, each described in turn or not at all", () => {
    const starts = pattern(/^a/);
    const own = check((text: string) => text.length > 1);
    const { checks: given } = describe(string(starts, own)) ?? {};
    expect(given).toEqual([starts, own]);
    expect(describe(starts)?.kind).toBe("check");
    expect(describe(own)).toBeUndefined();
  });

  it("should give undefined for a validator written by hand and for what is no function", () => {
    expect(describe(byHand)).toBeUndefined();
    expect(describe(undefined as never)).toBeUndefined();
    expect(describe({ "~description": { kind: "string" } } as never)).toBeUndefined();
  });

  it("should give frozen data that a later change to what the factory was given does not reach", () => {
    const options = { min: 2 };
    const shape = { name };
    const user = object(
      shape,
      check(() => true),
    );
    const text = string(options);
    options.min = 9;
    shape.name = string();
    expect(describe(text)?.options).toEqual({ min: 2 });
    expect(describe(user)?.["shape"]).toEqual({ name });
    for (const frozen of [describe(user), describe(user)?.["shape"], describe(text)?.options]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
  });

  it("should give the coerced validator's strict one, which holds its options", () => {
    const inner = describe(api.coerceNumber({ int: true }))?.["inner"] as AnyValidator;
    expect(describe(inner)).toMatchObject({ kind: "number", options: { int: true } });
  });

  it("should describe what standard returns as the validator it wraps, and leave that one as it was", () => {
    const wrapped = standard(name, englishMessages);
    expect(describe(wrapped)).toBe(describe(name));
    expect(describe(standard(byHand, englishMessages))).toBeUndefined();
  });

  it("should describe a recursive schema one level at a time", () => {
    type Tree = { children: Tree[] };
    const tree: AnyValidator<Tree> = object({ children: array(api.lazy(() => tree)) });
    const { children } = (describe(tree) as Description)["shape"] as { children: AnyValidator };
    const item = describe(children)?.["item"] as AnyValidator;
    const getter = describe(item)?.["getter"] as () => unknown;
    expect(getter()).toBe(tree);
  });

  it("should freeze the list of checks, which is the one the validator runs", () => {
    const short = api.string(api.startsWith("a"));
    const checks = describe(short)?.checks as unknown[];
    expect(Object.isFrozen(checks)).toBe(true);
    expect(() => checks.pop()).toThrow(TypeError);
    expect(short("b").ok).toBe(false);
  });

  it("should give the range a number clamps to, and not the object it was given", () => {
    const range = { min: 0, max: 10 };
    const clamped = api.number({ clamp: range });
    range.max = 99;
    const options = describe(clamped)?.options as { clamp: { min: number; max: number } };
    expect(options.clamp).toEqual({ min: 0, max: 10 });
    expect(Object.isFrozen(options.clamp)).toBe(true);
    expect(clamped(50)).toEqual({ ok: true, value: 10 });
  });

  it("should give the option that is a coercion's own, and none where it has none", () => {
    expect(describe(api.coerceDate({ zoneless: "utc" }))?.options).toEqual({ zoneless: "utc" });
    expect(describe(api.coerceDate())?.options).toBeUndefined();
    expect(describe(api.coerceNumber({ int: true }))?.options).toBeUndefined();
  });
});
