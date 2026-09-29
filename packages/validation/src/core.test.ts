// `.catch` here is the validator method, not `Promise#catch`.
/* oxlint-disable promise/prefer-await-to-then */
import { describe, expect, expectTypeOf, it } from "vitest";

import { NEVER, ValidationError, val, type Infer } from "./index";
import { codesOf, issuesOf, messagesOf, pathsOf, valueOf } from "./test-utils";

describe("execution modes", () => {
  it("validate returns ok with the value for valid input", () => {
    expect(val.string().validate("a")).toEqual({ ok: true, value: "a" });
  });

  it("validate returns a ValidationError carrying the issues for invalid input", () => {
    const result = val.string().validate(1);
    expect(result).toMatchObject({ ok: false, error: expect.any(ValidationError) });
    expect(issuesOf(result)).toHaveLength(1);
  });

  it("parse returns the value, and throws the ValidationError for invalid input", () => {
    expect(val.number().parse(2)).toBe(2);
    expect(() => val.number().parse("x")).toThrow(ValidationError);
  });

  it("is narrows without throwing on invalid input", () => {
    const input: unknown = "a";
    expect(val.string().is(1)).toBe(false);
    if (val.string().is(input)) {
      expectTypeOf(input).toEqualTypeOf<string>();
    }
  });

  it("validateAsync and parseAsync agree with their sync counterparts", async () => {
    expect(await val.string().validateAsync("a")).toEqual({ ok: true, value: "a" });
    expect(await val.string().parseAsync("a")).toBe("a");
    await expect(val.string().parseAsync(1)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("options", () => {
  const schema = val.object({ a: val.string(), b: val.string() });

  it("collects every issue by default", () => {
    expect(pathsOf(schema.validate({}))).toEqual([["a"], ["b"]]);
  });

  it("stops at the first issue with abortEarly", () => {
    expect(pathsOf(schema.validate({}, { abortEarly: true }))).toEqual([["a"]]);
  });

  it("never echoes the input into an issue unless includeInput is set", () => {
    const [plain] = issuesOf(val.number().validate("hunter2"));
    expect(JSON.stringify(plain)).not.toContain("hunter2");
    expect(plain).not.toHaveProperty("input");
    const [withInput] = issuesOf(val.number().validate("hunter2", { includeInput: true }));
    expect(withInput?.input).toBe("hunter2");
  });

  it("passes context to checks", () => {
    const schema = val.string().check((value, ctx) => {
      const taken = (ctx.options.context as { taken: string[] }).taken;
      if (taken.includes(value)) {
        ctx.addIssue({ message: "taken" });
      }
    });
    expect(schema.validate("a", { context: { taken: ["a"] } }).ok).toBe(false);
    expect(schema.validate("b", { context: { taken: ["a"] } }).ok).toBe(true);
  });
});

describe("immutability", () => {
  it("leaves the original untouched when a rule is added", () => {
    const base = val.string();
    const strict = base.min(3);
    expect(base.validate("a").ok).toBe(true);
    expect(strict.validate("a").ok).toBe(false);
  });

  it("keeps the concrete type so rules chain in any order", () => {
    const schema = val
      .string()
      .refine((value) => value !== "admin")
      .check(() => undefined)
      .max(5);
    expectTypeOf(schema).toEqualTypeOf<ReturnType<typeof val.string>>();
    expect(schema.validate("admin").ok).toBe(false);
    expect(schema.validate("toolong").ok).toBe(false);
  });

  it("keeps object methods after refine", () => {
    const schema = val
      .object({ a: val.string() })
      .refine(() => true)
      .extend({ b: val.number() });
    expect(schema.validate({ a: "x", b: 1 }).ok).toBe(true);
  });
});

describe("optional, nullable, nullish", () => {
  it("optional accepts undefined and otherwise defers to the inner validator", () => {
    const schema = val.string().optional();
    expect(valueOf(schema.validate(undefined))).toBeUndefined();
    expect(schema.validate(null).ok).toBe(false);
    expect(schema.validate(1).ok).toBe(false);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<string | undefined>();
  });

  it("nullable accepts null", () => {
    const schema = val.string().nullable();
    expect(valueOf(schema.validate(null))).toBeNull();
    expect(schema.validate(undefined).ok).toBe(false);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<string | null>();
  });

  it("nullish accepts both", () => {
    const schema = val.string().nullish();
    expect(schema.validate(null).ok).toBe(true);
    expect(schema.validate(undefined).ok).toBe(true);
    expect(schema.validate("a").ok).toBe(true);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<string | null | undefined>();
  });
});

describe("default", () => {
  it("replaces undefined, not null or invalid input", () => {
    const schema = val.string().default("x");
    expect(valueOf(schema.validate(undefined))).toBe("x");
    expect(valueOf(schema.validate("y"))).toBe("y");
    expect(schema.validate(null).ok).toBe(false);
  });

  it("calls a factory once per validation", () => {
    let calls = 0;
    const schema = val.array(val.string()).default(() => {
      calls += 1;
      return [];
    });
    expect(valueOf(schema.validate(undefined))).not.toBe(valueOf(schema.validate(undefined)));
    expect(calls).toBe(2);
  });

  it("types the output as required", () => {
    const schema = val.number().default(0);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<number>();
  });
});

describe("catch", () => {
  it("returns the fallback when validation fails", () => {
    expect(valueOf(val.number().catch(0).validate("x"))).toBe(0);
    expect(valueOf(val.number().catch(0).validate(5))).toBe(5);
  });

  it("gives the discarded issues to a fallback function", () => {
    const schema = val.number().catch((issues) => issues.length);
    expect(valueOf(schema.validate("x"))).toBe(1);
  });

  it("does not swallow exceptions thrown by user callbacks", () => {
    const schema = val
      .string()
      .transform((): string => {
        throw new TypeError("bug");
      })
      .catch("fallback");
    expect(() => schema.validate("x")).toThrow("bug");
  });
});

describe("refine", () => {
  it("fails with the default message when the predicate is false", () => {
    expect(
      messagesOf(
        val
          .number()
          .refine((n) => n > 1)
          .validate(0),
      ),
    ).toEqual(["Invalid value"]);
  });

  it("accepts a message string, a message function, and issue options", () => {
    expect(
      messagesOf(
        val
          .number()
          .refine((n) => n > 1, "too low")
          .validate(0),
      ),
    ).toEqual(["too low"]);
    expect(
      messagesOf(
        val
          .number()
          .refine(
            (n) => n > 1,
            (details) => `code ${details.code}`,
          )
          .validate(0),
      ),
    ).toEqual(["code custom"]);

    const schema = val
      .object({ password: val.string(), confirm: val.string() })
      .refine((data) => data.password === data.confirm, {
        message: "Passwords must match",
        path: ["confirm"],
        code: "password_mismatch",
        params: { field: "confirm" },
      });
    const [issue] = issuesOf(schema.validate({ password: "a", confirm: "b" }));
    expect(issue).toMatchObject({
      code: "password_mismatch",
      path: ["confirm"],
      message: "Passwords must match",
      params: { field: "confirm" },
    });
  });

  it("runs after the structure is valid, not before", () => {
    let calls = 0;
    const schema = val.string().refine(() => {
      calls += 1;
      return true;
    });
    schema.validate(1);
    expect(calls).toBe(0);
  });

  it("propagates exceptions thrown by the predicate", () => {
    expect(() =>
      val
        .string()
        .refine(() => {
          throw new Error("boom");
        })
        .validate("x"),
    ).toThrow("boom");
  });
});

describe("check", () => {
  it("reports several issues, with paths relative to the checked value", () => {
    const schema = val.object({ tags: val.array(val.string()) }).check((value, ctx) => {
      value.tags.forEach((tag, index) => {
        if (tag === "bad") {
          ctx.addIssue({ message: "no bad tags", path: ["tags", index] });
        }
      });
    });
    expect(pathsOf(schema.validate({ tags: ["bad", "ok", "bad"] }))).toEqual([
      ["tags", 0],
      ["tags", 2],
    ]);
  });

  it("locates relative paths under the value's own path", () => {
    const schema = val.object({
      inner: val.object({ a: val.string() }).check((_, ctx) => ctx.addIssue({ message: "x", path: ["a"] })),
    });
    expect(pathsOf(schema.validate({ inner: { a: "" } }))).toEqual([["inner", "a"]]);
  });

  it("supports custom issue codes and params", () => {
    const schema = val.string().check((_, ctx) => {
      ctx.addIssue({ code: "username_taken", message: "taken", params: { by: "someone" } });
    });
    expect(issuesOf(schema.validate("x"))[0]).toMatchObject({ code: "username_taken", params: { by: "someone" } });
  });

  it("is reusable as a named function", () => {
    const noSpaces = (value: string, ctx: { addIssue(issue: { message: string }): void }) => {
      if (value.includes(" ")) {
        ctx.addIssue({ message: "no spaces" });
      }
    };
    expect(val.string().check(noSpaces).validate("a b").ok).toBe(false);
    expect(val.string().check(noSpaces).validate("ab").ok).toBe(true);
  });

  it("stops after the first failing rule with abortEarly", () => {
    const schema = val.string().min(5).max(1);
    expect(issuesOf(schema.validate("abc"))).toHaveLength(2);
    expect(issuesOf(schema.validate("abc", { abortEarly: true }))).toHaveLength(1);
  });
});

describe("transform", () => {
  it("maps the value and its type", () => {
    const schema = val.string().transform((text) => text.length);
    expect(valueOf(schema.validate("abc"))).toBe(3);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<number>();
  });

  it("does not run when validation fails", () => {
    let calls = 0;
    val
      .string()
      .transform(() => (calls += 1))
      .validate(1);
    expect(calls).toBe(0);
  });

  it("can reject a value by reporting an issue and returning NEVER", () => {
    const schema = val.string().transform((text, ctx) => {
      const parsed = Number(text);
      if (Number.isNaN(parsed)) {
        ctx.addIssue({ message: "not numeric" });
        return NEVER;
      }
      return parsed;
    });
    expect(valueOf(schema.validate("4"))).toBe(4);
    expect(messagesOf(schema.validate("x"))).toEqual(["not numeric"]);
  });
});

describe("pipe", () => {
  it("feeds the output into the next validator", () => {
    const schema = val.string().transform(Number).pipe(val.number().int().min(1));
    expect(valueOf(schema.validate("3"))).toBe(3);
    expect(schema.validate("0").ok).toBe(false);
  });

  it("does not run the next validator when the first fails", () => {
    expect(codesOf(val.string().pipe(val.number()).validate(1))).toEqual(["invalid_type"]);
  });
});

describe("or and union", () => {
  it("accepts any variant and reports every variant's issues when none match", () => {
    const schema = val.string().or(val.number());
    expect(schema.validate("a").ok).toBe(true);
    expect(schema.validate(1).ok).toBe(true);
    const [issue] = issuesOf(schema.validate(true));
    expect(issue?.code).toBe("invalid_union");
    expect(issue?.params?.issues).toHaveLength(2);
  });

  it("returns the first variant that matches", () => {
    const schema = val.union([val.string().transform(() => "first"), val.string().transform(() => "second")]);
    expect(valueOf(schema.validate("x"))).toBe("first");
  });

  it("infers the union of the outputs", () => {
    const schema = val.union([val.string(), val.number()]);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<string | number>();
  });

  it("uses a custom failure message", () => {
    expect(messagesOf(val.union([val.string(), val.number()], "string or number").validate(true))).toEqual([
      "string or number",
    ]);
  });
});

describe("and and intersection", () => {
  it("requires both and merges object outputs", () => {
    const schema = val.object({ a: val.string() }).and(val.object({ b: val.number() }));
    expect(valueOf(schema.validate({ a: "x", b: 1 }))).toEqual({ a: "x", b: 1 });
    expect(pathsOf(schema.validate({}))).toEqual([["a"], ["b"]]);
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<{ a: string } & { b: number }>();
  });

  it("merges nested objects deeply and ignores prototype keys", () => {
    const schema = val.intersection(
      val.object({ nested: val.object({ a: val.string() }) }),
      val.object({ nested: val.object({ b: val.string() }) }),
    );
    expect(valueOf(schema.validate({ nested: { a: "1", b: "2" } }))).toEqual({ nested: { a: "1", b: "2" } });

    const loose = val.intersection(val.object({}).passthrough(), val.object({}).passthrough());
    const merged = valueOf(loose.validate(JSON.parse('{"__proto__":{"polluted":true}}')));
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps fields named constructor and prototype as data", () => {
    const schema = val.intersection(val.object({ constructor: val.string() }), val.object({ prototype: val.number() }));
    expect(valueOf(schema.validate({ constructor: "a", prototype: 1 }))).toEqual({ constructor: "a", prototype: 1 });
  });

  it("takes the right-hand output for non-objects", () => {
    const schema = val
      .string()
      .transform(() => "left")
      .and(val.string().transform(() => "right"));
    expect(valueOf(schema.validate("x"))).toBe("right");
  });

  it("stops after the first failing side with abortEarly", () => {
    const schema = val.object({ a: val.string() }).and(val.object({ b: val.string() }));
    expect(issuesOf(schema.validate({}, { abortEarly: true }))).toHaveLength(1);
  });
});

describe("async", () => {
  it("refine, check and transform accept async functions", async () => {
    const schema = val
      .string()
      .refine(async (value) => value !== "taken", "taken")
      .check(async (value, ctx) => {
        if (value === "banned") {
          ctx.addIssue({ message: "banned" });
        }
      })
      .transform(async (value) => value.toUpperCase());
    expect(valueOf(await schema.validateAsync("ok"))).toBe("OK");
    expect(messagesOf(await schema.validateAsync("taken"))).toEqual(["taken"]);
    expect(messagesOf(await schema.validateAsync("banned"))).toEqual(["banned"]);
  });

  it("treats a plain function that returns a promise as async", async () => {
    const schema = val.string().refine((value) => Promise.resolve(value === "a"), "no");
    expect((await schema.validateAsync("a")).ok).toBe(true);
    expect((await schema.validateAsync("b")).ok).toBe(false);
  });

  it("makes the sync methods throw instead of guessing", () => {
    const schema = val.string().refine(async () => true);
    expect(() => schema.validate("x")).toThrow(/validateAsync/);
    expect(() => schema.parse("x")).toThrow(/parseAsync/);
    expect(() => schema.is("x")).toThrow(/async/);
  });

  it("does not run async work for sync-invalid input", () => {
    let calls = 0;
    const schema = val.string().refine(async () => {
      calls += 1;
      return true;
    });
    expect(() => schema.validate(1)).not.toThrow();
    expect(calls).toBe(0);
  });

  it("keeps issue order stable when children finish out of order", async () => {
    const slow = (ms: number) =>
      val.string().refine(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return false;
      }, "bad");
    const schema = val.object({ a: slow(20), b: slow(1), c: slow(10) });
    expect(pathsOf(await schema.validateAsync({ a: "", b: "", c: "" }))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("does not start work after a failure with abortEarly", async () => {
    let calls = 0;
    const counting = val.string().refine(async () => {
      calls += 1;
      return false;
    });
    const schema = val.object({ a: counting, b: counting });
    await schema.validateAsync({ a: "", b: "" }, { abortEarly: true });
    expect(calls).toBe(1);
  });

  it("propagates async exceptions", async () => {
    const schema = val.string().refine(async () => {
      throw new Error("boom");
    });
    await expect(schema.validateAsync("x")).rejects.toThrow("boom");
  });

  it("catch applies to async failures too", async () => {
    const schema = val
      .string()
      .refine(async () => false)
      .catch("fallback");
    expect(valueOf(await schema.validateAsync("x"))).toBe("fallback");
  });
});

describe("Standard Schema", () => {
  it("exposes version 1 and the vendor", () => {
    expect(val.string()["~standard"]).toMatchObject({ version: 1, vendor: "codenhub" });
  });

  it("returns a plain result synchronously", () => {
    expect(val.string()["~standard"].validate("a")).toEqual({ value: "a" });
    expect(val.string()["~standard"].validate(1)).toEqual({
      issues: [{ message: "Expected string, received number", path: [] }],
    });
  });

  it("returns a promise only for async schemas", async () => {
    const schema = val.object({ n: val.string().refine(async () => false, "no") });
    const result = schema["~standard"].validate({ n: "x" });
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual({ issues: [{ message: "no", path: ["n"] }] });
  });
});
