import { describe, expect, it } from "vitest";

import { val } from "./index";
import { codesOf, messagesOf, valueOf } from "./test-utils";

describe("null, undefined, unknown and never", () => {
  it("null and undefined accept only themselves", () => {
    expect(val.null().validate(null).ok).toBe(true);
    expect(val.null().validate(undefined).ok).toBe(false);
    expect(val.undefined().validate(undefined).ok).toBe(true);
    expect(val.undefined().validate(null).ok).toBe(false);
  });

  it("unknown accepts everything untouched", () => {
    const value = { a: 1 };
    expect(valueOf(val.unknown().validate(value))).toBe(value);
    expect(val.unknown().validate(undefined).ok).toBe(true);
  });

  it("never rejects everything", () => {
    expect(val.never().validate(1).ok).toBe(false);
    expect(val.never().validate(undefined).ok).toBe(false);
    expect(messagesOf(val.never("forbidden").validate(1))).toEqual(["forbidden"]);
  });
});

describe("instanceOf", () => {
  class Animal {}
  class Dog extends Animal {}

  it("accepts instances, including subclasses", () => {
    expect(val.instanceOf(Animal).validate(new Dog()).ok).toBe(true);
    expect(val.instanceOf(Dog).validate(new Animal()).ok).toBe(false);
    expect(val.instanceOf(Date).validate(new Date()).ok).toBe(true);
  });

  it("names the class in the message", () => {
    expect(messagesOf(val.instanceOf(Dog).validate({}))).toEqual(["Expected instance of Dog, received object"]);
  });
});

describe("custom", () => {
  it("turns a predicate into a validator", () => {
    const even = val.custom<number>((input) => typeof input === "number" && input % 2 === 0, "not even");
    expect(even.validate(2).ok).toBe(true);
    expect(messagesOf(even.validate(3))).toEqual(["not even"]);
    expect(even.validate("2").ok).toBe(false);
  });

  it("supports async predicates and issue options", async () => {
    const schema = val.custom<string>(async (input) => input === "ok", { message: "nope", code: "not_ok" });
    expect((await schema.validateAsync("ok")).ok).toBe(true);
    expect(codesOf(await schema.validateAsync("x"))).toEqual(["not_ok"]);
  });

  it("composes like any validator", () => {
    const schema = val.object({
      id: val.custom<string>((input) => typeof input === "string" && input.startsWith("id_")),
    });
    expect(schema.validate({ id: "id_1" }).ok).toBe(true);
    expect(schema.validate({ id: "x" }).ok).toBe(false);
  });
});
