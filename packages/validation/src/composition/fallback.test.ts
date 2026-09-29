import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { codesOf, isFree, isPending, valueOf } from "../test-utils";
import { fallback } from "./fallback";

describe("fallback", () => {
  const pageSize = fallback(number({ int: true, min: 1, max: 100 }), 20);

  it("should pass a valid value through", () => {
    expect(valueOf(pageSize(50))).toBe(50);
  });

  it("should replace an invalid value with the fallback and never fail", () => {
    expect(valueOf(pageSize("lots"))).toBe(20);
    expect(valueOf(pageSize(500))).toBe(20);
    expect(valueOf(pageSize(undefined))).toBe(20);
  });

  it("should call a function fallback with the issues that were found", () => {
    const seen: string[][] = [];
    const logged = fallback(number({ min: 1 }), (issues) => {
      seen.push(issues.map((issue) => issue.code));
      return 1;
    });
    expect(valueOf(logged(0))).toBe(1);
    expect(seen).toEqual([["too_small"]]);
  });

  it("should not call the function for a valid value", () => {
    let calls = 0;
    const counted = fallback(number(), () => {
      calls += 1;
      return 0;
    });
    counted(5);
    expect(calls).toBe(0);
  });

  it("should work with asynchronous validators", async () => {
    const validator = fallback(isFree, "default");
    expect(isPending(validator("a"))).toBe(true);
    expect(valueOf(await validator("taken"))).toBe("default");
    expect(codesOf(await validator("a"))).toEqual([]);
  });
});
