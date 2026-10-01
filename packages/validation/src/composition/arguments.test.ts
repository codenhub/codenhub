import { describe, expect, it } from "vitest";

import { standard } from "../interop/standard";
import { number } from "../primitives/number";
import { array } from "./array";
import { fallback } from "./fallback";
import { intersection } from "./intersection";
import { json } from "./json";
import { lazy } from "./lazy";
import { map } from "./map";
import { nullable } from "./nullable";
import { nullish } from "./nullish";
import { object } from "./object";
import { optional } from "./optional";
import { partial } from "./partial";
import { pipe } from "./pipe";
import { record } from "./record";
import { set } from "./set";
import { tagged } from "./tagged";
import { transform } from "./transform";
import { tuple } from "./tuple";
import { union } from "./union";

// A validator that went missing, such as an import that resolved to nothing, typed as one.
const missing = undefined as unknown as typeof valid;
const valid = number();

describe("composer arguments", () => {
  it.each([
    ["object", () => object({ name: missing }), "shape.name"],
    ["partial", () => partial({ name: missing }), "validator"],
    ["array", () => array(missing), "item"],
    ["tuple item", () => tuple([valid, missing]), "items[1]"],
    ["tuple rest", () => tuple([valid], { rest: null as never }), "rest", "null"],
    ["record key", () => record(missing as never, valid), "key"],
    ["record value", () => record(number() as never, missing), "value"],
    ["map key", () => map(missing, valid), "key"],
    ["map value", () => map(valid, missing), "value"],
    ["set", () => set(missing), "item"],
    ["union", () => union([valid, missing]), "options[1]"],
    ["tagged", () => tagged("type", { a: missing as never }), "variants.a"],
    ["intersection left", () => intersection(missing, valid), "left"],
    ["intersection right", () => intersection(valid, missing), "right"],
    ["pipe", () => pipe(valid, missing), "validators[1]"],
    ["optional", () => optional(missing), "validator"],
    ["nullable", () => nullable(missing), "validator"],
    ["nullish", () => nullish(missing), "validator"],
    ["optional with a default", () => optional(missing, 1), "validator"],
    ["fallback", () => fallback(missing, 1), "validator"],
    ["transform validator", () => transform(missing, (value) => value), "validator"],
    ["transform convert", () => transform(valid, missing as never), "convert"],
    ["lazy", () => lazy(missing as never), "getter"],
    ["json", () => json(null as never), "validator", "null"],
    ["standard", () => standard(missing, {}), "validator"],
  ])(
    "%s should reject a child that is not a function when it is created",
    (_, create, name, received = "undefined") => {
      expect(create).toThrow(new TypeError(`${name} must be a function, received ${received}`));
    },
  );

  it.each([
    ["union", () => union([] as never), "union() needs at least one option"],
    ["pipe", () => (pipe as (...validators: unknown[]) => unknown)(), "pipe() needs at least one validator"],
    ["tagged", () => tagged("type", {}), "tagged() needs at least one variant"],
    ["tuple", () => tuple([] as never), "tuple() needs at least one item"],
    ["tuple with rest", () => tuple([] as never, { rest: valid }), "tuple() needs at least one item"],
  ])("%s should reject an empty list when it is created", (_, create, message) => {
    expect(create).toThrow(new TypeError(message));
  });

  it.each([
    ["union", () => union(valid as never), "options must be a list of validators, received function"],
    ["union", () => union(null as never), "options must be a list of validators, received null"],
    ["tuple", () => tuple(valid as never), "items must be a list of validators, received function"],
    ["tuple", () => tuple(undefined as never), "items must be a list of validators, received undefined"],
  ])("%s should reject what is not a list of validators when it is created, naming it", (_, create, message) => {
    expect(create).toThrow(new TypeError(message));
  });

  it.each([
    ["object", () => object([valid] as never)],
    ["partial", () => partial([valid] as never)],
  ])("%s should reject a list as its shape, which would name its properties 0, 1 and on", (_, create) => {
    expect(create).toThrow(new TypeError("shape must be a plain object of validators, received array"));
  });

  it.each([
    ["a list", [object({})], "array"],
    ["null", null, "null"],
    ["a Map", new Map([["a", object({})]]), "object"],
  ])("tagged should reject %s as its variants, which are a plain object of validators", (_, variants, received) => {
    expect(() => tagged("type", variants as never)).toThrow(
      new TypeError(`variants must be a plain object of validators, received ${received}`),
    );
  });

  it("should reject a tagged key that is not text, which would name the property `undefined`", () => {
    expect(() => (tagged as (key: unknown, variants: unknown) => unknown)(undefined, { a: object({}) })).toThrow(
      new TypeError("tagged(key) must be text, received undefined"),
    );
  });

  it("should reject a lazy getter that returns something other than a validator, naming the getter", () => {
    const broken = lazy(() => undefined as never);
    expect(() => broken(1)).toThrow(new TypeError("getter() must return a function, received undefined"));
  });

  it("should still accept json() without a validator", () => {
    expect(json()("1").ok).toBe(true);
  });
});
