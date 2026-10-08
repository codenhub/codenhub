import { describe, expect, expectTypeOf, it } from "vitest";

import { check } from "../builders/check";
import { coerceNumber } from "../coercion/coerce-number";
import { array } from "../composition/array";
import { brand, type Branded } from "../composition/brand";
import { extend } from "../composition/extend";
import { json } from "../composition/json";
import { meta } from "../composition/meta";
import { object } from "../composition/object";
import { omit } from "../composition/omit";
import { optional } from "../composition/optional";
import { partial } from "../composition/partial";
import { pick } from "../composition/pick";
import { required } from "../composition/required";
import { transform } from "../composition/transform";
import { union } from "../composition/union";
import type { AsyncValidator, Validator } from "../core/types";
import { email } from "../formats/email";
import { url } from "../formats/url";
import * as api from "../index";
import { literal } from "../primitives/literal";
import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import type { StandardSchemaV1 } from "./standard-schema";

const own = (validator: unknown): StandardSchemaV1.Props<unknown, unknown> =>
  (validator as StandardSchemaV1)["~standard"];

const user = object({ name: string({ min: 2 }), id: string() });

describe("a validator's own Standard Schema", () => {
  it.each([
    ["brand", brand(user, "User")],
    ["extend", extend(user, { role: string() })],
    ["meta", meta(user, { description: "A user" })],
    ["omit", omit(user, ["id"])],
    ["partial", partial(user)],
    ["pick", pick(user, ["name"])],
    ["required", required(partial(user))],
  ])("should be given by %s, for what it validates", (_, validator) => {
    expect(own(validator).validate({ name: "A" })).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([{ message: "Must be at least 2 characters", path: ["name"] }]),
      }),
    );
  });

  it("should wait for an asynchronous validator", async () => {
    const taken = string(check(async (name: string) => name !== "ada", { message: "Taken" }));
    const pending = own(taken).validate("ada");
    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toEqual({ issues: [{ message: "Taken", path: [] }] });
    expect(await own(taken).validate("grace")).toEqual({ value: "grace" });
  });

  it("should be in the type of what each factory makes, with its input and output", () => {
    expectTypeOf(string()).toExtend<StandardSchemaV1<string, string>>();
    expectTypeOf(email()).toExtend<StandardSchemaV1<string, string>>();
    expectTypeOf(url()).toExtend<StandardSchemaV1<string, string>>();
    expectTypeOf(number({ int: true })).toExtend<StandardSchemaV1<number, number>>();
    expectTypeOf(coerceNumber()).toExtend<StandardSchemaV1<string | number, number>>();
    expectTypeOf(literal("a")).toExtend<StandardSchemaV1<"a", "a">>();
    expectTypeOf(oneOf(["a", "b"])).toExtend<StandardSchemaV1<"a" | "b", "a" | "b">>();
    expectTypeOf(user).toExtend<StandardSchemaV1<{ name: string; id: string }, { name: string; id: string }>>();
    expectTypeOf(array(string())).toExtend<StandardSchemaV1<string[], string[]>>();
    expectTypeOf(optional(number(), 0)).toExtend<StandardSchemaV1<number | undefined, number>>();
    expectTypeOf(union([string(), number()])).toExtend<StandardSchemaV1<string | number, string | number>>();
    expectTypeOf(json()).toExtend<StandardSchemaV1<string, unknown>>();
    expectTypeOf(transform(string(), (text) => text.length)).toExtend<StandardSchemaV1<string, number>>();
    expectTypeOf(pick(user, ["name"])).toExtend<StandardSchemaV1<{ name: string }, { name: string }>>();
    expectTypeOf(brand(string(), "Id")).toExtend<StandardSchemaV1<string, Branded<string, "Id">>>();
    expectTypeOf(meta(string(), { title: "Name" })).toExtend<StandardSchemaV1<string, string>>();
    const taken = string(check(async (name: string) => name !== "ada"));
    expectTypeOf(taken).toExtend<StandardSchemaV1<string, string>>();
    expectTypeOf(object({ name: taken })).toExtend<StandardSchemaV1<{ name: string }, { name: string }>>();
  });

  it("should be in the type of every factory's validator", () => {
    const name = string();
    const all = {
      array: api.array(name),
      base64: api.base64(),
      bigint: api.bigint(),
      boolean: api.boolean(),
      cidr: api.cidr(),
      codec: api.codec(name, name, { decode: String, encode: String }),
      coerceBigint: api.coerceBigint(),
      coerceBoolean: api.coerceBoolean(),
      coerceDate: api.coerceDate(),
      coerceNumber: api.coerceNumber(),
      coerceString: api.coerceString(),
      creditCard: api.creditCard(),
      cuid2: api.cuid2(),
      date: api.date(),
      datetime: api.datetime(),
      domain: api.domain(),
      duration: api.duration(),
      email: api.email(),
      extend: api.extend(user, { role: name }),
      fallback: api.fallback(name, "none"),
      file: api.file(),
      format: api.format("slug-ish", (text) => text.length > 0)(),
      formData: api.formData(api.object({})),
      func: api.func(),
      guard: api.guard("Date", (value): value is Date => value instanceof Date)(),
      hex: api.hex(),
      hostname: api.hostname(),
      instanceOf: api.instanceOf(Date),
      intersection: api.intersection(api.object({}), api.object({})),
      ip: api.ip(),
      isoDate: api.isoDate(),
      json: api.json(name),
      jwt: api.jwt(),
      lazy: api.lazy(() => name),
      literal: api.literal("a"),
      mac: api.mac(),
      map: api.map(name, name),
      meta: api.meta(name, { title: "Name" }),
      nanoid: api.nanoid(),
      never: api.never(),
      nullable: api.nullable(name),
      nullish: api.nullish(name),
      number: api.number(),
      object: user,
      objectLike: api.objectLike({ name }),
      omit: api.omit(user, ["id"]),
      oneOf: api.oneOf(["a"]),
      optional: api.optional(name),
      partial: api.partial(user),
      phone: api.phone(),
      pick: api.pick(user, ["id"]),
      pipe: api.pipe(name, api.email()),
      port: api.port(),
      readonly: api.readonly(name),
      record: api.record(name, name),
      required: api.required(user),
      searchParams: api.searchParams(api.object({})),
      semver: api.semver(),
      set: api.set(name),
      slug: api.slug(),
      string: name,
      symbol: api.symbol(),
      tagged: api.tagged("type", { a: api.object({}) }),
      time: api.time(),
      transform: api.transform(name, (text) => text.length),
      tuple: api.tuple([name]),
      ulid: api.ulid(),
      union: api.union([name]),
      unknown: api.unknown(),
      url: api.url(),
      uuid: api.uuid(),
    } satisfies Record<string, StandardSchemaV1>;
    expect(Object.values(all).every((each) => "~standard" in each)).toBe(true);
  });

  it("should keep a Schema usable wherever a Validator is taken", () => {
    expectTypeOf(string()).toExtend<Validator<string, string>>();
    expectTypeOf(string(check(async () => true))).toExtend<AsyncValidator<string, string>>();
  });

  it("should be left out of a validator written by hand, which this package did not make", () => {
    const byHand: Validator<string> = (input) =>
      typeof input === "string"
        ? { ok: true, value: input }
        : { ok: false, error: { issues: [{ code: "custom", path: [] }] } };
    expect("~standard" in byHand).toBe(false);
  });
});
