import { describe, expect, it } from "vitest";

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
  // Written by hand, since a collection of this package stops at its limit of issues.
  const many: Validator<unknown[]> = (input) => ({
    ok: false,
    error: { issues: (input as unknown[]).map((_, index) => ({ code: "invalid_type", path: [index] })) as never },
  });
  const level: Validator<Level> = object({
    next: optional(lazy(() => level)),
    items: optional(many),
  });

  const nested = (depth: number): Level => {
    let input: Level = { items: Array.from({ length: 20_000 }, () => "x") };
    for (let count = 0; count < depth; count += 1) {
      input = { next: input };
    }
    return input;
  };

  /** How long one run takes, in milliseconds. */
  const time = (input: Level): number => {
    const start = performance.now();
    level(input);
    return performance.now() - start;
  };

  /**
   * The fastest of five runs of each input, in milliseconds, so a pause of the machine during one does not
   * count. The runs alternate between the inputs, so a busy stretch slows both rather than only the one
   * timed during it.
   */
  const fastestOfEach = (first: Level, second: Level): [number, number] => {
    let fastest: [number, number] = [Infinity, Infinity];
    for (let round = 0; round < 5; round += 1) {
      fastest = [Math.min(fastest[0], time(first)), Math.min(fastest[1], time(second))];
    }
    return fastest;
  };

  const deep = nested(100);

  it("should report every issue at its full path", () => {
    const issues = issuesOf(level(deep));
    expect(issues).toHaveLength(20_000);
    expect(issues[0]?.path).toEqual([...Array.from({ length: 100 }, () => "next"), "items", 0]);
  });

  // Each composer used to copy the path of every issue below it, which cost the square of the depth for
  // each issue. Two depths are compared, not one timed alone, so a slower or busier machine changes both
  // and not the answer: four times the depth takes about five times as long when each path is written
  // once, and sixteen when it is copied at every level. One level is no longer what the deep input is
  // compared with: a path of three segments became six times faster to write and one of a hundred three
  // times, so that ratio rose from 14 to 28 with nothing copied twice, and the test failed one run in two.
  // The depths were once timed one after the other, and a CI runner busy only while the deep one ran
  // measured a ratio of 10.04 where a quiet machine measures about five.
  it("should report them in time that grows with the input", { timeout: 30_000 }, () => {
    const [deepTime, shallowTime] = fastestOfEach(deep, nested(25));
    expect(deepTime).toBeLessThan(10 * shallowTime);
  });
});
