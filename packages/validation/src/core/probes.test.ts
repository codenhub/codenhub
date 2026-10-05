import { afterEach, describe, expect, it, vi } from "vitest";

import { coerceDate } from "../coercion/coerce-date";
import { array } from "../composition/array";
import { map } from "../composition/map";
import { object } from "../composition/object";
import { set } from "../composition/set";
import { union } from "../composition/union";
import { date } from "../primitives/date";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { describeType } from "./result";

/*
 * Whether a value is a Date, a Map or a Set is asked by running a built-in method on it, which throws
 * for a value that is not one. A throw costs far more than the validation around it, so input that
 * cannot be one is never asked: 100 kB of valid `{}` under a union of four options took 0.9 s, and
 * 100,000 dates read from text by `coerceDate` took 1.3 s. Each test counts the probes that threw.
 */
const thrown = (probe: { mock: { results: { type: string }[] } }): number =>
  probe.mock.results.filter((result) => result.type === "throw").length;

const spies = () => ({
  time: vi.spyOn(Date.prototype, "getTime"),
  mapSize: vi.spyOn(Map.prototype, "size", "get"),
  setSize: vi.spyOn(Set.prototype, "size", "get"),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a value that cannot be a date, a map or a set", () => {
  it("should be named without a probe that throws when it is a plain object", () => {
    const { time } = spies();
    expect([describeType({}), describeType(JSON.parse('{"a":1}'))]).toEqual(["object", "object"]);
    expect(thrown(time)).toBe(0);
  });

  it("should fail the options of a union before the one it matches without a probe that throws", () => {
    const probes = spies();
    expect(union([string(), number(), object({ id: number() })])({ id: 1 }).ok).toBe(true);
    expect(union([date(), string()])("text").ok).toBe(true);
    expect(union([set(number()), map(string(), number()), array(number())])([1]).ok).toBe(true);
    expect([thrown(probes.time), thrown(probes.mapSize), thrown(probes.setSize)]).toEqual([0, 0, 0]);
  });

  it("should be converted by coerceDate from text or a timestamp without a probe that throws", () => {
    const { time } = spies();
    expect(coerceDate()("2024-01-15T10:00:00Z").ok).toBe(true);
    expect(coerceDate()(1_705_312_800_000).ok).toBe(true);
    expect(coerceDate()("not a date").ok).toBe(false);
    expect(thrown(time)).toBe(0);
  });

  it("should still be rejected by date, map and set, and named by its type", () => {
    expect(date()("2024-01-15").ok).toBe(false);
    expect(date()([]).ok).toBe(false);
    expect(map(string(), number())([]).ok).toBe(false);
    expect(set(number())("text").ok).toBe(false);
    expect([describeType(new Date(0)), describeType(new Date(Number.NaN)), describeType(new Map())]).toEqual([
      "date",
      "invalid date",
      "object",
    ]);
  });
});
