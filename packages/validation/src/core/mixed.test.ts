import { beforeEach, describe, expect, it, vi } from "vitest";

// Each test loads the package afresh, since `transform` and `lazy` turn the run on for the whole program.
beforeEach(() => {
  vi.resetModules();
});

const load = async () => ({
  ...(await import("../composition/object")),
  ...(await import("../composition/transform")),
  ...(await import("../composition/lazy")),
  ...(await import("../primitives/number")),
  ...(await import("./nesting")),
  ...(await import("./result")),
});

/** Validates an object of a property with no fast test and one with, and says in what order they ran. */
async function orderOf(turnOn: (loaded: Awaited<ReturnType<typeof load>>) => void) {
  const loaded = await load();
  const { object, pass, withFast } = loaded;
  turnOn(loaded);
  const log: string[] = [];
  const slow = (value: unknown) => {
    log.push("slow");
    return pass(value);
  };
  const tested = withFast(
    (value: unknown) => {
      log.push("full");
      return pass(value);
    },
    (value) => {
      log.push("fast");
      return value;
    },
  );
  const result = object({ a: slow, b: tested })({ a: 1, b: 2 });
  return { log, result };
}

describe("the run of an object only some of whose properties have a fast test", () => {
  it("should be off until transform or lazy is called, and leave the object to its full work", async () => {
    const { log, result } = await orderOf(() => undefined);
    expect(log).toEqual(["slow", "full"]);
    expect(result).toEqual({ ok: true, value: { a: 1, b: 2 } });
  });

  it("should ask the fast tests first once transform was called", async () => {
    const { log, result } = await orderOf(({ transform, number }) => transform(number(), (value) => value));
    expect(log).toEqual(["fast", "slow"]);
    expect(result).toEqual({ ok: true, value: { a: 1, b: 2 } });
  });

  it("should ask the fast tests first once lazy was called", async () => {
    const { log, result } = await orderOf(({ lazy, number }) => lazy(() => number()));
    expect(log).toEqual(["fast", "slow"]);
    expect(result).toEqual({ ok: true, value: { a: 1, b: 2 } });
  });
});
