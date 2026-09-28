import { describe, expect, it } from "vitest";

import { chain, collect, isPromiseLike } from "./async";

describe("isPromiseLike", () => {
  it("recognizes promises and thenables only", () => {
    expect(isPromiseLike(Promise.resolve())).toBe(true);
    // oxlint-disable-next-line unicorn/no-thenable -- a thenable is what is being recognized
    expect(isPromiseLike({ then: () => undefined })).toBe(true);
    expect(isPromiseLike({})).toBe(false);
    expect(isPromiseLike(null)).toBe(false);
    expect(isPromiseLike(() => undefined)).toBe(false);
    expect(isPromiseLike("then")).toBe(false);
  });
});

describe("chain", () => {
  it("stays synchronous for a plain value", () => {
    expect(chain(1, (value) => value + 1)).toBe(2);
  });

  it("waits for a pending value", async () => {
    await expect(chain(Promise.resolve(1), (value) => value + 1)).resolves.toBe(2);
  });

  it("flattens a promise returned by the next step", async () => {
    await expect(chain(1, (value) => Promise.resolve(value + 1))).resolves.toBe(2);
  });
});

describe("collect", () => {
  it("gathers synchronous results in order", () => {
    expect(collect(3, (index) => index * 2)).toEqual([0, 2, 4]);
  });

  it("returns a promise, still in order, when any result is pending", async () => {
    const results = collect(3, (index) =>
      index === 1 ? new Promise<number>((resolve) => setTimeout(() => resolve(1), 5)) : index,
    );
    expect(results).toBeInstanceOf(Promise);
    expect(await results).toEqual([0, 1, 2]);
  });

  it("runs every index even after a result that would stop a sequential run, when no stop is given", () => {
    const seen: number[] = [];
    collect(3, (index) => seen.push(index));
    expect(seen).toEqual([0, 1, 2]);
  });

  it("stops after the first result the stop function accepts, synchronously", () => {
    const seen: number[] = [];
    const results = collect(
      5,
      (index) => {
        seen.push(index);
        return index;
      },
      (result) => result === 2,
    );
    expect(results).toEqual([0, 1, 2]);
    expect(seen).toEqual([0, 1, 2]);
  });

  it("stops asynchronously without starting later work", async () => {
    const started: number[] = [];
    const results = await collect(
      4,
      async (index) => {
        started.push(index);
        return index;
      },
      (result) => result === 1,
    );
    expect(results).toEqual([0, 1]);
    expect(started).toEqual([0, 1]);
  });

  it("returns an empty result for a count of zero", () => {
    expect(collect(0, () => 1)).toEqual([]);
    expect(
      collect(
        0,
        () => 1,
        () => true,
      ),
    ).toEqual([]);
  });

  it("starts pending work in parallel when no stop is given", async () => {
    const order: string[] = [];
    const task = (name: string, ms: number) =>
      new Promise<string>((resolve) =>
        setTimeout(() => {
          order.push(name);
          resolve(name);
        }, ms),
      );
    const results = await collect(2, (index) => (index === 0 ? task("slow", 20) : task("fast", 1)));
    expect(results).toEqual(["slow", "fast"]);
    expect(order).toEqual(["fast", "slow"]);
  });
});
