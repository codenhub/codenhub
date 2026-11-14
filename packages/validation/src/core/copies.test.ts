import { describe as suite, expect, it, vi } from "vitest";

import * as here from "../index";

/**
 * A second copy of the package, as an application has when two of its dependencies ask for versions that
 * do not overlap: its own modules, so its own issue list and its own mark of a failure.
 */
const otherCopy = async (): Promise<typeof here> => {
  vi.resetModules();
  return (await import("../index")) as typeof here;
};

const REFUSED = "is not a validator of this copy of the package";

suite("a validator another copy of the package made", () => {
  it("should be a copy of its own", async () => {
    const other = await otherCopy();

    expect(other.string).not.toBe(here.string);
    expect(other.string()(1).ok).toBe(false);
  });

  it("should be refused as a child when the composer is created, and never run as one", async () => {
    const other = await otherCopy();
    const name = other.string();

    expect(() => here.object({ name })).toThrow(`shape.name ${REFUSED}`);
    expect(() => here.array(name)).toThrow(REFUSED);
    expect(() => here.optional(name)).toThrow(REFUSED);
    expect(() => here.union([here.number(), name])).toThrow(`options[1] ${REFUSED}`);
    expect(() => here.record(here.string(), name)).toThrow(REFUSED);
    expect(() => here.pipe(here.string(), name)).toThrow(REFUSED);
    expect(() => here.objectWithRest({}, name)).toThrow(`rest ${REFUSED}`);
  });

  it("should be refused by a lazy when it first runs", async () => {
    const other = await otherCopy();
    const later = here.lazy(() => other.string());

    expect(() => later(1)).toThrow(REFUSED);
  });

  it("should have its checks refused too", async () => {
    const other = await otherCopy();

    expect(() => here.string(other.startsWith("a"))).toThrow("checks made with check()");
    expect(() => here.string(other.check((value: string) => value === "a"))).toThrow("checks made with check()");
    expect(() =>
      here.object(
        { a: here.string() },
        other.checkFields<{ a: string }, "a">(["a"], () => true),
      ),
    ).toThrow("checks made with check()");
  });

  it("should not be reshaped or written back, whose parts would run in the other copy", async () => {
    const other = await otherCopy();
    const strict = other.strictObject({});
    const user = other.object({ age: other.number() });

    expect(() => here.partial(strict)).toThrow("partial() needs a validator made by object()");
    expect(() => here.required(strict)).toThrow("required() needs a validator made by object()");
    expect(() => here.pick(user, ["age"])).toThrow("pick() needs a validator made by object()");
    expect(() => here.omit(user, ["age"])).toThrow("omit() needs a validator made by object()");
    expect(() => here.extend(user, {})).toThrow("extend() needs a validator made by object()");
    expect(() => here.encode(user, { age: 1 })).toThrow(
      "encode cannot write back a validator another copy of the package made at the root. Use a codec there",
    );
    expect(() => here.encode(here.object({ user: here.validator(user) }), { user: { age: 1 } })).toThrow(
      "encode cannot write back a validator written by hand at user. Use a codec there",
    );
  });

  it("should validate as a child once validator() is given it, with its issues at its place", async () => {
    const other = await otherCopy();
    const user = here.object({ profile: here.validator(other.object({ age: other.number() })) });

    expect(user({ profile: { age: 30 } })).toEqual({ ok: true, value: { profile: { age: 30 } } });
    expect(user({ profile: { age: "30" } })).toEqual({
      ok: false,
      error: {
        issues: [
          { code: "invalid_type", path: ["profile", "age"], params: { expected: "number", received: "string" } },
        ],
      },
    });
  });

  it("should be read, called and used as a Standard Schema by this copy", async () => {
    const other = await otherCopy();
    const user = other.object({ age: other.number() });

    expect(here.describe(user)?.kind).toBe("object");
    expect(here.toJsonSchema(user)).toMatchObject({ type: "object", required: ["age"] });
    expect(here.is(user, { age: 1 })).toBe(true);
    expect(here.is(user, { age: "1" })).toBe(false);
    expect(() => here.assert(user, { age: "1" })).toThrow("age: Invalid value");
    expect(here.standard(user)["~standard"].validate({ age: "1" })).toMatchObject({ issues: [{ path: ["age"] }] });
    expect(here.meta(user, { title: "User" })({ age: "1" }).ok).toBe(false);
  });
});
