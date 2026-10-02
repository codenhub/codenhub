import { describe, expect, it } from "vitest";

import { array } from "../composition/array";
import { lazy } from "../composition/lazy";
import { object } from "../composition/object";
import { optional } from "../composition/optional";
import { number } from "../primitives/number";
import { isFree, issuesOf } from "../test-utils";
import { append, below, call, composed, pathAt } from "./nesting";
import { pass, toIssue } from "./result";
import type { ValidationIssue, Validator } from "./types";

describe("pathAt", () => {
  it("should write the place's segments, root first, then the path below it", () => {
    expect(pathAt(below(below(undefined, "a"), 0), ["b"])).toEqual(["a", 0, "b"]);
  });

  it("should give the path itself at the root", () => {
    const path = ["b"];
    expect(pathAt(undefined, path)).toBe(path);
  });
});

describe("append", () => {
  it("should take more issues than can be spread as arguments", () => {
    const target: ValidationIssue[] = [];
    append(
      target,
      Array.from({ length: 500_000 }, () => toIssue({ code: "x" })),
    );
    expect(target).toHaveLength(500_000);
  });
});

describe("call", () => {
  const handWritten: Validator<number> = () => ({ ok: false, error: { issues: [{ code: "x", path: ["b"] }] } });

  it("should move the issues of a validator written by hand to the place, without changing them", () => {
    const result = handWritten(1);
    const original = result.ok ? undefined : result.error.issues[0];
    expect(issuesOf(call(() => result, 1, below(undefined, "a")) as never)).toEqual([{ code: "x", path: ["a", "b"] }]);
    expect(original?.path).toEqual(["b"]);
  });

  it("should place an issue written by hand without a path at the value", () => {
    const pathless = (() => ({ ok: false, error: { issues: [{ code: "x" }] } })) as unknown as Validator<number>;
    expect(issuesOf(call(pathless, 1, below(undefined, "a")) as never)).toEqual([{ code: "x", path: ["a"] }]);
  });

  it("should move the issues of an asynchronous validator once it settles", async () => {
    expect(issuesOf(await call(isFree, "taken", below(undefined, "a")))).toEqual([{ code: "taken", path: ["a"] }]);
  });

  it("should reach a composer's work with the place, so it writes each path in full once", () => {
    const seen: unknown[] = [];
    const composer = composed((input, place) => {
      seen.push(place);
      return pass(input);
    });
    call(composer, 1, below(undefined, "a"));
    expect(seen).toEqual([{ segment: "a", parent: undefined }]);
  });
});

describe("a composer called on its own", () => {
  it("should report paths relative to its input, even when another composer called it from a hand-written one", () => {
    const inner = object({ b: number() });
    const relative: unknown[] = [];
    const spy: Validator<unknown> = (input) => {
      const result = inner(input);
      relative.push(issuesOf(result)[0]?.path);
      return result;
    };
    expect(issuesOf(object({ a: spy })({ a: { b: "x" } }))[0]?.path).toEqual(["a", "b"]);
    expect(relative).toEqual([["b"]]);
  });
});

describe("deep input with many issues", () => {
  interface Level {
    next?: Level;
    items?: unknown[];
  }
  const level: Validator<Level> = object({
    next: optional(lazy(() => level)),
    items: optional(array(number())),
  });

  // Each composer used to copy the path of every issue below it, which cost the square of the depth for
  // each issue: this input took seconds.
  it("should report every issue at its full path in time that grows with the input", () => {
    let input: Level = { items: Array.from({ length: 40_000 }, () => "x") };
    for (let depth = 0; depth < 100; depth += 1) {
      input = { next: input };
    }
    const start = performance.now();
    const issues = issuesOf(level(input));
    expect(performance.now() - start).toBeLessThan(1500);
    expect(issues).toHaveLength(40_000);
    expect(issues[0]?.path).toEqual([...Array.from({ length: 100 }, () => "next"), "items", 0]);
  });
});
