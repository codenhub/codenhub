import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { nonBlank } from "../checks/non-blank";
import { split } from "./split";

const short = check((value: string) => value.length >= 3, { code: "too_small" });
const noSpaces = check((value: string) => !value.includes(" "), { code: "spaces" });

describe("split", () => {
  it("should take an object as the options and the rest as checks", () => {
    expect(split([{ message: "m" }, short])).toEqual([{ message: "m" }, [short]]);
  });

  it("should take a function in first place as a check, with no options", () => {
    expect(split([short, noSpaces])).toEqual([{}, [short, noSpaces]]);
  });

  it("should give empty options and no checks for no arguments, or undefined options", () => {
    expect(split([])).toEqual([{}, []]);
    expect(split([undefined, short])).toEqual([{}, [short]]);
  });

  it("should throw when a check is not a function, since that is a mistake in the schema", () => {
    expect(() => split([{}, "x"])).toThrow(TypeError);
  });

  it("should throw for a function that neither check() nor a rule of this package made", () => {
    const bare = (): undefined => undefined;
    expect(() => split([bare])).toThrow("checks made with check()");
    expect(() => split([{}, short, bare])).toThrow("checks made with check()");
    expect(split([nonBlank(), short])[1]).toHaveLength(2);
  });

  it("should throw for a list in place of the options, which would drop the checks in it", () => {
    expect(() => split([[short]])).toThrow(TypeError);
    expect(() => split([[]])).toThrow(TypeError);
  });

  it("should throw for an option the factory does not read", () => {
    expect(() => split([{ maxx: 1 }], "min max")).toThrow("Unknown option maxx");
    expect(split([{ max: 1 }], "min max")[0]).toEqual({ max: 1 });
  });

  it("should copy and freeze the options, so changing the object given changes nothing", () => {
    const given = { message: "m" };
    const [options] = split([given]);
    given.message = "changed";
    expect(options).toEqual({ message: "m" });
    expect(Object.isFrozen(options)).toBe(true);
  });
});

describe("split, given something other than options or a check first", () => {
  it.each([["abc"], [5], [true]])("should throw a TypeError for %s", (first) => {
    expect(() => split([first])).toThrow(TypeError);
  });

  it.each([
    ["a regular expression", /^a/],
    ["a Date", new Date(0)],
    ["a Map", new Map([["max", 1]])],
    [
      "a class instance",
      new (class Options {
        max = 1;
      })(),
    ],
  ])("should throw a TypeError for %s, which would be read as options and ignored", (_, first) => {
    expect(() => split([first])).toThrow(TypeError);
  });

  it("should accept options without a prototype", () => {
    const options = Object.assign(Object.create(null) as object, { message: "Bad" });
    expect(split([options])[0]).toEqual({ message: "Bad" });
  });
});
