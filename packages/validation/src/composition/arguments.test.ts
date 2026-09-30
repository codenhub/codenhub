import { describe, expect, it } from "vitest";

import { standard } from "../interop/standard";
import { number } from "../primitives/number";
import { array } from "./array";
import { discriminatedUnion } from "./discriminated-union";
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
import { refine } from "./refine";
import { set } from "./set";
import { transform } from "./transform";
import { tuple } from "./tuple";
import { union } from "./union";
import { withDefault } from "./with-default";

// A validator that went missing, such as an import that resolved to nothing, typed as one.
const missing = undefined as unknown as typeof valid;
const valid = number();

describe("composer arguments", () => {
  it.each([
    ["object", () => object({ name: missing }), "shape.name"],
    ["partial", () => partial({ name: missing }), "validator"],
    ["array", () => array(missing), "element"],
    ["tuple item", () => tuple([valid, missing]), "items[1]"],
    ["tuple rest", () => tuple([valid], { rest: null as never }), "rest", "null"],
    ["record key", () => record(missing as never, valid), "key"],
    ["record value", () => record(number() as never, missing), "value"],
    ["map key", () => map(missing, valid), "key"],
    ["map value", () => map(valid, missing), "value"],
    ["set", () => set(missing), "element"],
    ["union", () => union([valid, missing]), "options[1]"],
    ["discriminatedUnion", () => discriminatedUnion("type", { a: missing as never }), "variants.a"],
    ["intersection left", () => intersection(missing, valid), "left"],
    ["intersection right", () => intersection(valid, missing), "right"],
    ["pipe", () => pipe(valid, missing), "validators[1]"],
    ["optional", () => optional(missing), "validator"],
    ["nullable", () => nullable(missing), "validator"],
    ["nullish", () => nullish(missing), "validator"],
    ["withDefault", () => withDefault(missing, 1), "validator"],
    ["fallback", () => fallback(missing, 1), "validator"],
    ["transform validator", () => transform(missing, (value) => value), "validator"],
    ["transform convert", () => transform(valid, missing as never), "convert"],
    ["refine validator", () => refine(missing, () => true), "validator"],
    ["refine check", () => refine(valid, missing as never), "check"],
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
  ])("%s should reject an empty list when it is created", (_, create, message) => {
    expect(create).toThrow(new TypeError(message));
  });

  it("should reject a lazy getter that returns something other than a validator, naming the getter", () => {
    const broken = lazy(() => undefined as never);
    expect(() => broken(1)).toThrow(new TypeError("getter() must return a function, received undefined"));
  });

  it("should still accept json() without a validator", () => {
    expect(json()("1").ok).toBe(true);
  });
});
