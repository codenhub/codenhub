import { describe, expect, it } from "vitest";

import { unique } from "../checks/unique";
import { fail } from "../core/result";
import type { AsyncValidator, Validator } from "../core/types";
import { englishMessages } from "../messages/english-messages";
import { formatIssue } from "../messages/format-issue";
import { boolean } from "../primitives/boolean";
import { literal } from "../primitives/literal";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { issuesOf } from "../test-utils";
import { array } from "./array";
import { intersection } from "./intersection";
import { map } from "./map";
import { object } from "./object";
import { record } from "./record";
import { set } from "./set";
import { tuple } from "./tuple";
import { union } from "./union";

/*
 * A collection stops once its items have reported 1,000 issues, and says so with one more. Without the
 * limit, a megabyte of `{}` given to an array of a union of five objects took a gigabyte and six
 * seconds, since every item is reported once per option.
 */
const LIMIT = 1000;
const COUNT = 5000;
const numbers = (): number[] => Array.from({ length: COUNT }, () => 1);
const stopped = (path: readonly (string | number)[] = []): object => ({
  code: "too_big",
  path,
  params: { maximum: LIMIT, type: "issues" },
});

describe("the most issues a collection reports", () => {
  it("should stop an array at the limit, and call no item after it", () => {
    let calls = 0;
    const counted: Validator<string> = (input) => {
      calls += 1;
      return string()(input);
    };
    const issues = issuesOf(array(counted)(numbers()));
    expect(issues).toHaveLength(LIMIT + 1);
    expect(issues[LIMIT - 1]?.path).toEqual([LIMIT - 1]);
    expect(issues[LIMIT]).toEqual(stopped());
    expect(calls).toBe(LIMIT);
  });

  it("should report the limit at the path of the collection that stopped", () => {
    const issues = issuesOf(object({ items: array(string()) })({ items: numbers() }));
    expect(issues).toHaveLength(LIMIT + 1);
    expect(issues[LIMIT]).toEqual(stopped(["items"]));
  });

  it("should add nothing when the last item is the one that reaches the limit", () => {
    const input = Array.from({ length: LIMIT }, () => 1);
    expect(issuesOf(array(string())(input))).toHaveLength(LIMIT);
    // An item it did not reach may hold more, so it says it stopped.
    expect(issuesOf(array(string())([...input, "a"]))).toHaveLength(LIMIT + 1);
  });

  it("should not count what the options of a union found for an item that passes", () => {
    const either = array(union([string(), number()]));
    expect(either(numbers()).ok).toBe(true);
  });

  it("should count the issues that the issue of a union holds", () => {
    const shape = (type: string): Validator<object> => object({ type: literal(type), id: string() });
    const events = array(union([shape("a"), shape("b"), shape("c")]));
    const issues = issuesOf(events(Array.from({ length: COUNT }, () => ({}))));
    // Each item is one issue that holds two for each of the three options, so seven of the limit.
    expect(issues).toHaveLength(Math.ceil(LIMIT / 7) + 1);
    expect(issues.at(-1)).toEqual(stopped());
  });

  it("should stop the collection around one whose items reached the limit", () => {
    const issues = issuesOf(array(array(string()))([numbers(), numbers()]));
    expect(issues).toHaveLength(LIMIT + 1);
    expect(issues[0]?.path).toEqual([0, 0]);
    expect(issues[LIMIT]).toEqual(stopped());
  });

  it("should stop at the first item whose union holds as many issues as the limit", () => {
    const lists = array(union([array(string()), array(boolean())]));
    const issues = issuesOf(lists(Array.from({ length: 50 }, () => numbers())));
    expect(issues).toHaveLength(2);
    expect(issues[0]?.code).toBe("invalid_union");
    expect(issues[1]).toEqual(stopped());
  });

  it("should cut by what the issues hold when the items waited", async () => {
    const held = Array.from({ length: 600 }, () => ({ code: "inner", path: [] }));
    const heavy: AsyncValidator<string> = async () => {
      await Promise.resolve();
      return fail({ code: "outer", params: { issues: held } });
    };
    const issues = issuesOf(await array(heavy)([1, 2, 3, 4, 5]));
    expect(issues.map((issue) => issue.code)).toEqual(["outer", "outer", "too_big"]);
  });

  it("should stop a tuple, a set, a map and a record the same way", () => {
    expect(issuesOf(tuple([string()], { rest: string() })(numbers())).at(-1)).toEqual(stopped());
    expect(issuesOf(set(string())(new Set(Array.from({ length: COUNT }, (_, index) => index)))).at(-1)).toEqual(
      stopped(),
    );
    const entries = Array.from({ length: COUNT }, (_, index) => [`k${index}`, index] as const);
    expect(issuesOf(map(string(), string())(new Map(entries)))).toHaveLength(LIMIT + 1);
    expect(issuesOf(map(string({ max: 1 }), number())(new Map(entries))).at(-1)).toEqual(stopped());
    expect(issuesOf(record(string(), string())(Object.fromEntries(entries)))).toHaveLength(LIMIT + 1);
    expect(issuesOf(record(string({ max: 1 }), number())(Object.fromEntries(entries))).at(-1)).toEqual(stopped());
  });

  it("should list the unknown keys of a strict object up to the limit", () => {
    const entries = Array.from({ length: COUNT }, (_, index) => [`k${index}`, index] as const);
    const issues = issuesOf(object({ a: number() }, { unknownKeys: "strict" })(Object.fromEntries(entries)));
    // The unknown keys up to the limit, the limit, and then the property that is missing.
    expect(issues).toHaveLength(LIMIT + 2);
    expect(issues[LIMIT]).toEqual(stopped());
    expect(issues.at(-1)?.path).toEqual(["a"]);
  });

  it("should list the repeats that unique and a set find up to the limit", () => {
    const repeats = Array.from({ length: COUNT }, () => "a");
    expect(issuesOf(array(string(), unique())(repeats))).toHaveLength(LIMIT + 1);
    expect(issuesOf(array(string(), unique())(repeats)).at(-1)).toEqual(stopped());
    const same = set(string({ trim: true }))(new Set(Array.from({ length: COUNT }, (_, index) => " ".repeat(index))));
    expect(issuesOf(same)).toHaveLength(LIMIT + 1);
    expect(issuesOf(same).at(-1)).toEqual(stopped());
  });

  it("should list the conflicts of an intersection up to the limit", () => {
    const both = intersection(array(string({ trim: true })), array(string()));
    const issues = issuesOf(both(Array.from({ length: COUNT }, () => " a ")));
    expect(issues).toHaveLength(LIMIT + 1);
    expect(issues.at(-1)).toEqual(stopped());
  });

  it("should cut the issues of items that wait, every one of which has started", async () => {
    let calls = 0;
    const taken: AsyncValidator<string> = async () => {
      calls += 1;
      await Promise.resolve();
      return fail({ code: "taken" });
    };
    const issues = issuesOf(await array(taken)(numbers()));
    expect(calls).toBe(COUNT);
    expect(issues).toHaveLength(LIMIT + 1);
    expect(issues[LIMIT]).toEqual(stopped());
  });

  it("should give the limit the collection's own message, and English wording", () => {
    const worded = issuesOf(array(string(), { message: "Fix the list" })(numbers()));
    expect(worded[LIMIT]?.message).toBe("Fix the list");
    const [last] = issuesOf(array(string())(numbers())).slice(-1);
    expect(formatIssue(last as never, englishMessages)).toBe("Stopped after 1000 problems, so there may be more");
  });
});
