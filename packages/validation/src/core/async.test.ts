import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { array } from "../composition/array";
import { intersection } from "../composition/intersection";
import { map } from "../composition/map";
import { object } from "../composition/object";
import { record } from "../composition/record";
import { set } from "../composition/set";
import { transform } from "../composition/transform";
import { tuple } from "../composition/tuple";
import { string } from "../primitives/string";
import { issuesOf } from "../test-utils";
import { chain, collect, isThenable } from "./async";
import type { AsyncValidator, Validator } from "./types";

// The thenables below are the subject of these tests, not accidents.
/* oxlint-disable unicorn/no-thenable */
describe("isThenable", () => {
  it("should recognize promises and other thenables", () => {
    expect(isThenable(Promise.resolve())).toBe(true);
    expect(isThenable({ then: () => undefined })).toBe(true);
  });

  it("should reject everything else", () => {
    expect([undefined, null, 1, "then", {}, { then: 1 }].map(isThenable)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("chain", () => {
  it("should stay synchronous for a plain value", () => {
    expect(chain(2, (value) => value * 2)).toBe(4);
  });

  it("should return a promise when the value is pending", async () => {
    const chained = chain(Promise.resolve(2), (value) => value * 2);
    expect(isThenable(chained)).toBe(true);
    expect(await chained).toBe(4);
  });
});

describe("collect", () => {
  it("should return the same items synchronously when nothing is pending", () => {
    expect(collect([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("should return a promise when any item is pending, in input order", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 10));
    const collected = collect([slow, 2, Promise.resolve(3)]);
    expect(isThenable(collected)).toBe(true);
    expect(await collected).toEqual([1, 2, 3]);
  });

  it("should handle an empty list synchronously", () => {
    expect(collect([])).toEqual([]);
  });
});

describe("chain, given a thenable that is not a promise", () => {
  // A minimal thenable: it settles through its callbacks and returns nothing from `then`, as `await` allows.
  const settling = <T>(value: T, sync = false): PromiseLike<T> =>
    ({
      then(resolve: (value: T) => void) {
        if (sync) {
          resolve(value);
        } else {
          setTimeout(() => resolve(value), 1);
        }
      },
    }) as unknown as PromiseLike<T>;

  it("should settle as await would, to a promise of what next returns", async () => {
    const chained = chain(settling(2), (value) => value * 3);
    expect(chained).toBeInstanceOf(Promise);
    expect(await chained).toBe(6);
    expect(await chain(settling(2, true), (value) => value * 3)).toBe(6);
  });

  it("should let a check whose test returns one reject the value", async () => {
    const never = string(check(() => settling(false), "never"));
    expect(issuesOf(await never("a"))).toEqual([{ code: "custom", path: [], message: "never" }]);
  });

  it("should let a transform whose function returns one produce a result", async () => {
    expect(await transform(string(), () => settling(5))("a")).toEqual({ ok: true, value: 5 });
  });

  it("should pass on a rejection from one", async () => {
    const rejecting = { then: (_resolve: unknown, reject: (reason: Error) => void) => reject(new Error("boom")) };
    await expect(transform(string(), () => rejecting as PromiseLike<never>)("a")).rejects.toThrow("boom");
  });
});

describe("a composer whose child throws after another returned a pending result", () => {
  it("should leave no rejection of the pending one unhandled, whichever composer it is", async () => {
    const rejecting: AsyncValidator<unknown> = async () => Promise.reject(new Error("lookup failed"));
    const throwing: Validator<unknown> = () => {
      throw new Error("bug");
    };
    // Pending for the first item, and throwing for the next.
    const mixed: AsyncValidator<unknown> = (input) => (input === 1 ? rejecting(input) : throwing(input));
    const unhandled: unknown[] = [];
    const listen = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listen);
    try {
      const composers: [string, () => unknown][] = [
        ["object", () => object({ a: rejecting, b: throwing })({ a: 1, b: 2 })],
        ["array", () => array(mixed)([1, 2])],
        ["tuple", () => tuple([rejecting, throwing])([1, 2])],
        ["record", () => record(string(), mixed)({ a: 1, b: 2 })],
        ["set", () => set(mixed)(new Set([1, 2]))],
        [
          "map",
          () =>
            map(
              string(),
              mixed,
            )(
              new Map([
                ["a", 1],
                ["b", 2],
              ]),
            ),
        ],
        ["intersection", () => intersection(rejecting, throwing)(1)],
        [
          "checks",
          () =>
            string(
              check(async () => Promise.reject(new Error("x"))),
              check(() => throwing(1) as never),
            )("a"),
        ],
      ];
      for (const [, run] of composers) {
        expect(run).toThrow("bug");
      }
      // Unhandled rejections are reported after the microtasks, so a macrotask lets them surface.
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      process.off("unhandledRejection", listen);
    }
    expect(unhandled).toEqual([]);
  });
});
