import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { accepts, issuesOf, isPending } from "../test-utils";
import { check } from "./check";
import { format } from "./format";
import { guard } from "./guard";

describe("check", () => {
  const even = check((n: number) => n % 2 === 0);

  it("should report nothing for a value its test accepts", () => {
    expect(even(2)).toBeUndefined();
  });

  it("should report code custom at the value's own location by default", () => {
    expect(even(3)).toEqual([{ code: "custom", path: [] }]);
  });

  it("should take a string as the message", () => {
    expect(check((n: number) => n > 0, "Must be positive")(0)).toEqual([
      { code: "custom", path: [], message: "Must be positive" },
    ]);
  });

  it("should report the issue it was given, copied so later changes do not leak in", () => {
    const path = ["confirm"];
    const params = { field: "password" };
    const matches = check((value: string) => value === "x", { code: "mismatch", path, params });
    path.push("changed");
    params.field = "changed";
    expect(matches("y")).toEqual([{ code: "mismatch", path: ["confirm"], params: { field: "password" } }]);
  });

  it("should report a fresh issue on every failure", () => {
    expect(even(1)?.[0]).not.toBe(even(1)?.[0]);
  });

  it("should be asynchronous when its test returns a promise", async () => {
    const free = check(async (name: string) => name !== "taken", "Taken");
    const pending = free("taken");
    expect(isPending(pending)).toBe(true);
    expect(await pending).toEqual([{ code: "custom", path: [], message: "Taken" }]);
    expect(await free("free")).toBeUndefined();
  });

  it("should throw when the test is not a function", () => {
    expect(() => check("x" as never)).toThrow(TypeError);
  });
});

describe("format", () => {
  const slug = format("slug", (text) => /^[a-z]+(?:-[a-z]+)*$/.test(text));

  it("should accept a string of the format as written", () => {
    expect(slug()("hello-world")).toEqual({ ok: true, value: "hello-world" });
  });

  it("should report a non-string as invalid_type and another string as invalid_format naming the format", () => {
    expect(issuesOf(slug()(1))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "string", received: "number" } },
    ]);
    expect(issuesOf(slug()("Hello"))).toEqual([{ code: "invalid_format", path: [], params: { format: "slug" } }]);
  });

  it("should word its own issues and run checks, with or without options", () => {
    const short = check((text: string) => text.length <= 5, "Too long");
    expect(issuesOf(slug({ message: "Use a slug" }, short)("Hello")).map((found) => found.message)).toEqual([
      "Use a slug",
    ]);
    expect(issuesOf(slug({ message: "Use a slug" }, short)("hello-world")).map((found) => found.message)).toEqual([
      "Too long",
    ]);
    expect(accepts(slug(short), "abc", "abcdef")).toEqual([true, false]);
  });

  it("should not run checks on a string that is not of the format", () => {
    const seen: string[] = [];
    const record = check((text: string) => {
      seen.push(text);
      return true;
    });
    slug(record)("Not A Slug");
    slug(record)("a-slug");
    expect(seen).toEqual(["a-slug"]);
  });

  it("should throw when the test is not a function", () => {
    expect(() => format("x", undefined as never)).toThrow(TypeError);
  });
});

describe("format and guard, given a test that returns a promise", () => {
  it("should throw a TypeError pointing to check, instead of accepting every value", () => {
    const pending = async (): Promise<boolean> => false;
    expect(() => format("x", pending as never)()("anything")).toThrow(
      new TypeError("format() needs a synchronous test. Put a rule that waits in a check."),
    );
    expect(() => guard("x", pending as never)()(5)).toThrow(
      new TypeError("guard() needs a synchronous test. Put a rule that waits in a check."),
    );
  });
});

describe("guard", () => {
  class Widget {}
  const widget = guard("Widget", (input): input is Widget => input instanceof Widget);
  const isNumber = (input: unknown): input is number => typeof input === "number";

  it("should accept a value its guard accepts, as it is", () => {
    const value = new Widget();
    expect(widget()(value)).toEqual({ ok: true, value });
  });

  it("should report invalid_type naming the expected type", () => {
    expect(issuesOf(widget()({}))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "Widget", received: "object" } },
    ]);
  });

  it("should take a message and checks", () => {
    expect(issuesOf(guard("number", isNumber)({ message: "Number please" })("1"))[0]?.message).toBe("Number please");
    expect(accepts(guard("number", isNumber)(check((n: number) => n > 0)), 1, -1)).toEqual([true, false]);
  });

  it("should make validators that report as a built-in one does", () => {
    expect(issuesOf(guard("number", isNumber)()("1"))).toEqual(issuesOf(number()("1")));
  });

  it("should throw when the guard is not a function", () => {
    expect(() => guard("x", null as never)).toThrow(TypeError);
  });
});
