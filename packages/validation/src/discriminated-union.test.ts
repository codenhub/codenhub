import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { codesOf, issuesOf, messagesOf, pathsOf, valueOf } from "./test-utils";

const event = val.discriminatedUnion("type", [
  val.object({ type: val.literal("click"), x: val.number(), y: val.number() }),
  val.object({ type: val.literal("key"), key: val.string() }),
]);

describe("discriminatedUnion", () => {
  it("validates against the variant the discriminator names", () => {
    expect(valueOf(event.validate({ type: "click", x: 1, y: 2 }))).toEqual({ type: "click", x: 1, y: 2 });
    expect(valueOf(event.validate({ type: "key", key: "a" }))).toEqual({ type: "key", key: "a" });
  });

  it("infers a union of the variants", () => {
    expectTypeOf<Infer<typeof event>>().toEqualTypeOf<
      { type: "click"; x: number; y: number } | { type: "key"; key: string }
    >();
  });

  it("reports only the chosen variant's issues", () => {
    expect(pathsOf(event.validate({ type: "click", x: "a", y: "b" }))).toEqual([["x"], ["y"]]);
  });

  it("reports an unknown or missing discriminator at its own path, listing the options", () => {
    const [unknownTag] = issuesOf(event.validate({ type: "scroll" }));
    expect(unknownTag).toMatchObject({ code: "invalid_union", path: ["type"], params: { options: ["click", "key"] } });
    expect(messagesOf(event.validate({ type: "scroll" }))).toEqual(['Invalid "type": expected one of "click", "key"']);
    expect(pathsOf(event.validate({}))).toEqual([["type"]]);
  });

  it("does not read the discriminator from the prototype", () => {
    expect(event.validate(Object.create({ type: "key" })).ok).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(messagesOf(event.validate(null))).toEqual(["Expected object, received null"]);
  });

  it("supports enum discriminators that cover several values", () => {
    const schema = val.discriminatedUnion("kind", [
      val.object({ kind: val.enum(["a", "b"]), shared: val.string() }),
      val.object({ kind: val.literal("c"), own: val.number() }),
    ]);
    expect(schema.validate({ kind: "b", shared: "x" }).ok).toBe(true);
    expect(schema.validate({ kind: "c", own: 1 }).ok).toBe(true);
  });

  it("keeps variant rules", () => {
    const schema = val.discriminatedUnion("t", [
      val.object({ t: val.literal("a"), n: val.number() }).refine((value) => value.n > 0, "positive"),
    ]);
    expect(codesOf(schema.validate({ t: "a", n: 0 }))).toEqual(["custom"]);
  });

  it("uses a custom message when no variant matches", () => {
    const schema = val.discriminatedUnion("t", [val.object({ t: val.literal("a") })], "unknown t");
    expect(messagesOf(schema.validate({ t: "z" }))).toEqual(["unknown t"]);
  });

  it("refuses variants that cannot be told apart when the schema is built", () => {
    expect(() =>
      val.discriminatedUnion("t", [val.object({ t: val.literal("a") }), val.object({ t: val.literal("a") })]),
    ).toThrow(/same "t" value/);
    expect(() => val.discriminatedUnion("t", [val.object({ t: val.string() }) as never])).toThrow(/val\.literal\(\)/);
    expect(() => val.discriminatedUnion("t", [val.object({ other: val.literal("a") }) as never])).toThrow(TypeError);
  });

  it("lists its tags", () => {
    expect(event.tags).toEqual(["click", "key"]);
  });
});
