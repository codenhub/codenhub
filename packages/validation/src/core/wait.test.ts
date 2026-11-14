import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { validator } from "../builders/validator";
import { array } from "../composition/array";
import { intersection } from "../composition/intersection";
import { map } from "../composition/map";
import { object } from "../composition/object";
import { record } from "../composition/record";
import { set } from "../composition/set";
import { transform } from "../composition/transform";
import { tuple } from "../composition/tuple";
import { string } from "../primitives/string";
import { isPending, issuesOf } from "../test-utils";
import type { ValidationResult } from "./types";

// The thenables below are the subject of these tests, not accidents.
/* oxlint-disable unicorn/no-thenable */
describe("a validation that waits", () => {
  it("should stay synchronous when nothing it runs waits", () => {
    expect(isPending(string(check(() => true))("a"))).toBe(false);
    expect(isPending(transform(string(), (text) => text.length)("a"))).toBe(false);
  });

  it("should give a promise once a check or a transform waits", async () => {
    const pending = transform(string(), async (text) => text.length)("ab");
    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toEqual({ ok: true, value: 2 });
  });

  it("should keep the results of children in input order, whichever settles first", async () => {
    const slow = validator(
      async (input) =>
        new Promise<ValidationResult<number>>((resolve) =>
          setTimeout(() => resolve({ ok: true, value: input as number }), 10),
        ),
    );
    const quick = validator(async (input) => ({ ok: true, value: input as number }));
    expect(await tuple([slow, quick, quick])([1, 2, 3])).toEqual({ ok: true, value: [1, 2, 3] });
  });
});

describe("validations that wait at the same time", () => {
  const later = <T>(milliseconds: number, value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), milliseconds));

  it("should each keep their own issues and paths, with another validation run between them", async () => {
    // The issues of the validation running are kept in one place and swapped around each wait, so a
    // mistake there would give one request's issues to another.
    const signup = object({
      name: string(check((name) => later(5, name !== "taken"), { code: "taken" })),
      tags: array(string(check((tag) => later(1, tag.length > 1), { code: "short" }))),
      code: string(check((code) => later(3, code !== "x"), { code: "bad_code" })),
    });
    const first = signup({ name: "taken", tags: ["ok", "a"], code: "fine" });
    const between = signup({ name: 1, tags: "no", code: 2 });
    const second = signup({ name: "free", tags: ["b", "cd", "e"], code: "x" });
    expect([isPending(first), isPending(between), isPending(second)]).toEqual([true, false, true]);
    const [one, other, synchronous] = await Promise.all([first, second, between]);
    expect(issuesOf(one)).toEqual([
      { code: "taken", path: ["name"] },
      { code: "short", path: ["tags", 1] },
    ]);
    expect(issuesOf(other)).toEqual([
      { code: "short", path: ["tags", 0] },
      { code: "short", path: ["tags", 2] },
      { code: "bad_code", path: ["code"] },
    ]);
    expect(issuesOf(synchronous).map(({ path }) => path)).toEqual([["name"], ["tags"], ["code"]]);
  });
});

describe("a thenable that is not a promise", () => {
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

  it("should settle as await would, to a promise of the result", async () => {
    const pending = transform(string(), () => settling(6))("a");
    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toEqual({ ok: true, value: 6 });
    expect(await transform(string(), () => settling(6, true))("a")).toEqual({ ok: true, value: 6 });
  });

  it("should let a check whose test returns one reject the value", async () => {
    const never = string(check(() => settling(false), "never"));
    expect(issuesOf(await never("a"))).toEqual([{ code: "custom", path: [], message: "never" }]);
  });

  it("should let a transform whose function returns one produce a result", async () => {
    expect(await transform(string(), () => settling(5))("a")).toEqual({ ok: true, value: 5 });
  });

  it("should let a validator written by hand return one", async () => {
    const byHand = validator((input) => settling<ValidationResult<unknown>>({ ok: true, value: input }));
    expect(await object({ a: byHand })({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
  });

  it("should pass on a rejection from one", async () => {
    const rejecting = { then: (_resolve: unknown, reject: (reason: Error) => void) => reject(new Error("boom")) };
    await expect(transform(string(), () => rejecting as PromiseLike<never>)("a")).rejects.toThrow("boom");
  });
});

describe("a composer whose child throws after another returned a pending result", () => {
  it("should leave no rejection of the pending one unhandled, whichever composer it is", async () => {
    const rejecting = validator(async (): Promise<ValidationResult<unknown>> =>
      Promise.reject(new Error("lookup failed")),
    );
    const throwing = validator((): ValidationResult<unknown> => {
      throw new Error("bug");
    });
    // Pending for the first item, and throwing for the next.
    const mixed = validator((input) => (input === 1 ? rejecting(input) : throwing(input)));
    const unhandled: unknown[] = [];
    const listen = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listen);
    try {
      const composers: [string, () => unknown][] = [
        ["object", () => object({ a: rejecting, b: throwing })({ a: 1, b: 2 })],
        [
          "object with a property of this package between them",
          () => object({ a: rejecting, c: string(), b: throwing })({ a: 1, c: "x", b: 2 }),
        ],
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
