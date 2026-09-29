import { describe, expect, it } from "vitest";

import type { Validator } from "../core/types";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { lazy } from "./lazy";
import { object } from "./object";

interface Category {
  name: string;
  children: Category[];
}

describe("lazy", () => {
  const category: Validator<Category> = object({
    name: string(),
    children: array(lazy(() => category)),
  });

  it("should let a validator refer to itself for recursive data", () => {
    const tree = { name: "root", children: [{ name: "a", children: [{ name: "b", children: [] }] }] };
    expect(valueOf(category(tree))).toEqual(tree);
  });

  it("should report issues deep in the recursion at their full path", () => {
    const tree = { name: "root", children: [{ name: "a", children: [{ name: 1, children: [] }] }] };
    expect(issuesOf(category(tree)).map((issue) => issue.path)).toEqual([["children", 0, "children", 0, "name"]]);
  });

  it("should call the getter once, on first use", () => {
    let calls = 0;
    const counted = lazy(() => {
      calls += 1;
      return number();
    });
    expect(calls).toBe(0);
    counted(1);
    counted(2);
    expect(calls).toBe(1);
  });

  it("should work with asynchronous validators", async () => {
    const validator = lazy(() => isFree);
    expect(isPending(validator("a"))).toBe(true);
    expect(valueOf(await validator("a"))).toBe("a");
  });
});
