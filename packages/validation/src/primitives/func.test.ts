import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { englishMessages } from "../messages/english-messages";
import { formatIssue } from "../messages/format-issue";
import { accepts, issuesOf, valueOf } from "../test-utils";
import { func } from "./func";

describe("func", () => {
  it("should accept every kind of function, including one from another realm", () => {
    const foreign = runInNewContext("() => 1") as unknown;
    expect(
      accepts(
        func(),
        () => 1,
        function named() {},
        async () => 1,
        function* generate() {},
        class Thing {},
        Math.max,
        foreign,
      ),
    ).toEqual(Array(7).fill(true));
  });

  it("should reject everything that is not a function", () => {
    expect(accepts(func(), undefined, null, "() => 1", {}, [], { call: () => 1 })).toEqual(Array(6).fill(false));
  });

  it("should return the function itself, typed with the signature given", () => {
    const handler = (value: string): number => value.length;
    const found: (value: string) => number = valueOf(func<(value: string) => number>()(handler));
    expect(found).toBe(handler);
  });

  it("should fail with invalid_type naming the received type, worded by englishMessages", () => {
    const issues = issuesOf(func()("log"));
    expect(issues).toEqual([{ code: "invalid_type", path: [], params: { expected: "function", received: "string" } }]);
    expect(issues.map((issue) => formatIssue(issue, englishMessages))).toEqual(["Expected function, received string"]);
  });
});
