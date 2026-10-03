import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { issuesOf } from "../test-utils";
import { array } from "./array";
import { map } from "./map";
import { object } from "./object";
import { record } from "./record";
import { set } from "./set";
import { tuple } from "./tuple";

/*
 * A parent used to spread its child's issues into `push`, which passes each as an argument and
 * overflows the stack past about 120,000. Bad input must come back as a failure however much of it
 * is bad, so each composer is given a child with far more issues than that.
 */
const COUNT = 300_000;
const numbers = (): number[] => Array.from({ length: COUNT }, () => 1);

// Large on purpose, so a loaded machine may take a while over it; it checks what happens, not how fast.
describe("a child with more issues than fit in a call", { timeout: 30_000 }, () => {
  const items = array(string());

  it("should be reported by object", () => {
    const issues = issuesOf(object({ items })({ items: numbers() }));
    expect(issues).toHaveLength(COUNT);
    expect(issues[COUNT - 1]?.path).toEqual(["items", COUNT - 1]);
  });

  it("should be reported by array", () => {
    expect(issuesOf(array(items)([numbers()]))).toHaveLength(COUNT);
  });

  it("should be reported by tuple", () => {
    expect(issuesOf(tuple([items])([numbers()]))).toHaveLength(COUNT);
  });

  it("should be reported by set", () => {
    expect(issuesOf(set(items)(new Set([numbers()])))).toHaveLength(COUNT);
  });

  it("should be reported by record", () => {
    expect(issuesOf(record(string(), items)({ items: numbers() }))).toHaveLength(COUNT);
  });

  it("should be reported by map", () => {
    expect(issuesOf(map(string(), items)(new Map([["items", numbers()]])))).toHaveLength(COUNT);
  });

  it("should be reported by a flat array of that many bad items", () => {
    expect(issuesOf(array(number({ min: 5 }))(numbers()))).toHaveLength(COUNT);
  });
});
