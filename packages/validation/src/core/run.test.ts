import { describe, expect, it } from "vitest";

import { validator } from "../builders/validator";
import { lazy } from "../composition/lazy";
import { object } from "../composition/object";
import { optional } from "../composition/optional";
import { number } from "../primitives/number";
import { isFree, issuesOf } from "../test-utils";
import type { ValidationResult, Validator } from "./types";

describe("a validator written by hand, under a composer", () => {
  const handWritten: Validator<number> = () => ({ ok: false, error: { issues: [{ code: "x", path: ["b"] }] } });

  it("should have its issues moved to its place, without changing them", () => {
    const result = handWritten(1);
    const original = result.ok ? undefined : result.error.issues[0];
    const same = validator(() => result);
    expect(issuesOf(object({ a: same })({ a: 1 }))).toEqual([{ code: "x", path: ["a", "b"] }]);
    expect(original?.path).toEqual(["b"]);
    // The same result given again is placed again, from the path it was written with.
    expect(issuesOf(object({ c: object({ a: same }) })({ c: { a: 1 } }))).toEqual([
      { code: "x", path: ["c", "a", "b"] },
    ]);
  });

  it("should have an issue written without a path placed at the value", () => {
    const pathless = validator((() => ({
      ok: false,
      error: { issues: [{ code: "x" }] },
    })) as unknown as Validator<number>);
    expect(issuesOf(object({ a: pathless })({ a: 1 }))).toEqual([{ code: "x", path: ["a"] }]);
  });

  it("should have the issues of an asynchronous one moved once it settles", async () => {
    expect(issuesOf(await object({ a: isFree })({ a: "taken" }))).toEqual([{ code: "taken", path: ["a"] }]);
  });

  it("should give more issues than can be spread as arguments", () => {
    const many = validator(() => ({
      ok: false,
      error: { issues: Array.from({ length: 500_000 }, () => ({ code: "x", path: [] })) as never },
    }));
    expect(issuesOf(object({ a: many })({ a: 1 }))).toHaveLength(500_000);
  });
});

describe("a composer called on its own", () => {
  it("should report paths relative to its input, even when another composer called it from a hand-written one", () => {
    const inner = object({ b: number() });
    const relative: unknown[] = [];
    const spy = validator((input) => {
      const result = inner(input);
      relative.push(issuesOf(result)[0]?.path);
      return result;
    });
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
  const many = validator((input): ValidationResult<unknown[]> => ({
    ok: false,
    error: { issues: (input as unknown[]).map((_, index) => ({ code: "invalid_type", path: [index] })) as never },
  }));
  // Deeper than the default limit of 128, so the two depths compared can be far apart.
  const level: Validator<Level> = object({
    next: optional(lazy(() => level, { maxDepth: 200 })),
    items: optional(many),
  });

  const nested = (depth: number): Level => {
    let input: Level = { items: Array.from({ length: 10_000 }, () => "x") };
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
   * The fastest of six runs of each input, in milliseconds, so a pause of the machine during one does not
   * count. The runs alternate between the inputs, so a busy stretch slows both rather than only the one
   * timed during it, and each input goes first in half the rounds, so neither always pays for collecting
   * the garbage the other left.
   */
  const fastestOfEach = (first: Level, second: Level): [number, number] => {
    const fastest: [number, number] = [Infinity, Infinity];
    for (let round = 0; round < 6; round += 1) {
      for (const index of round % 2 === 0 ? [0, 1] : [1, 0]) {
        fastest[index] = Math.min(fastest[index] ?? Infinity, time(index === 0 ? first : second));
      }
    }
    return fastest;
  };

  const deep = nested(160);

  it("should report every issue at its full path", () => {
    const issues = issuesOf(level(deep));
    expect(issues).toHaveLength(10_000);
    expect(issues[0]?.path).toEqual([...Array.from({ length: 160 }, () => "next"), "items", 0]);
  });

  // Each composer used to copy the path of every issue below it, which cost the square of the depth for
  // each issue. Two depths are compared, not one timed alone, so a slower or busier machine changes both
  // and not the answer: four times the depth takes about five times as long when each path is written
  // once, and sixteen when it is copied at every level. One level is no longer what the deep input is
  // compared with: a path of three segments became six times faster to write and one of a hundred three
  // times, so that ratio rose from 14 to 28 with nothing copied twice, and the test failed one run in two.
  // The depths were once timed one after the other, and a CI runner busy only while the deep one ran
  // measured a ratio of 10.04 where a quiet machine measures about five. Comparing 100 levels with 25
  // left too little room on either side: the copying was measured at 12 to 14 times, and a busy runner
  // still measured 10.03 interleaved. Sixteen times the depth separates the two: on one machine, 160
  // levels took 11 to 13 times what 10 took alone and 6 to 21 times with four suites running at once,
  // while copying the path at every level took 250 to 270 times alone and 81 to 300 under that load.
  it("should report them in time that grows with the input", { timeout: 30_000 }, () => {
    const [deepTime, shallowTime] = fastestOfEach(deep, nested(10));
    expect(deepTime).toBeLessThan(40 * shallowTime);
  });
});
