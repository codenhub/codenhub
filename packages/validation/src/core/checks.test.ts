import { describe, expect, it } from "vitest";

import { issuesOf, isPending } from "../test-utils";
import { finish, leaf, split, word } from "./checks";
import { issue } from "./result";
import type { Check, ValidationResult } from "./types";

const short: Check<string> = (value) => (value.length < 3 ? [issue("too_small")] : undefined);
const noSpaces: Check<string> = (value) => (value.includes(" ") ? [issue("spaces")] : undefined);
const isString = (input: unknown): boolean => typeof input === "string";
const sync = <T>(result: unknown): ValidationResult<T> => result as ValidationResult<T>;

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

  it("should throw for a list in place of the options, which would drop the checks in it", () => {
    expect(() => split([[short]])).toThrow(TypeError);
    expect(() => split([[]])).toThrow(TypeError);
  });
});

describe("word", () => {
  it("should leave issues alone without a message", () => {
    expect(word([issue("a")], undefined)).toEqual([{ code: "a", path: [] }]);
  });

  it("should give each issue the text, or what a function words it as", () => {
    expect(word([issue("a"), issue("b")], "Bad")).toEqual([
      { code: "a", path: [], message: "Bad" },
      { code: "b", path: [], message: "Bad" },
    ]);
    expect(word([issue("a", { n: 1 })], (found) => `${found.code}${String(found.params?.n)}`)[0]?.message).toBe("a1");
  });

  it("should keep the wording an issue already has", () => {
    expect(word([{ code: "a", path: [], message: "Mine" }], "Bad")).toEqual([{ code: "a", path: [], message: "Mine" }]);
  });
});

describe("finish", () => {
  it("should pass the value when nothing was found", () => {
    expect(finish("value", [], undefined, [short])).toEqual({ ok: true, value: "value" });
  });

  it("should report every check's issues, worded unless a check worded its own", () => {
    const worded: Check<string> = () => [{ code: "worded", path: [], message: "Mine" }];
    expect(issuesOf(sync(finish("a b", [], "Own", [short, noSpaces, worded])))).toEqual([
      { code: "spaces", path: [], message: "Own" },
      { code: "worded", path: [], message: "Mine" },
    ]);
  });

  it("should run no check once the validator found an issue of its own, and report that one alone", () => {
    let calls = 0;
    const counted: Check<string> = () => {
      calls += 1;
      return [issue("checked")];
    };
    expect(issuesOf(sync(finish("a b", [issue("own")], "Own", [counted, noSpaces])))).toEqual([
      { code: "own", path: [], message: "Own" },
    ]);
    expect(calls).toBe(0);
  });

  it("should stay synchronous when its own issue stops an asynchronous check", () => {
    let calls = 0;
    const later = async (): Promise<undefined> => {
      calls += 1;
      return undefined;
    };
    const result = finish("a", [issue("own")], undefined, [later]);
    expect(isPending(result)).toBe(false);
    expect(issuesOf(sync(result)).map((found) => found.code)).toEqual(["own"]);
    expect(calls).toBe(0);
  });

  it("should copy a check's issues, so a list the check reuses is never changed", () => {
    const reused = Object.freeze([Object.freeze(issue("reused"))]);
    expect(issuesOf(sync(finish("a", [], "Worded", [() => reused])))).toEqual([
      { code: "reused", path: [], message: "Worded" },
    ]);
    expect(reused[0]).toEqual({ code: "reused", path: [] });
  });

  it("should place an issue a check wrote by hand without a path at the value", () => {
    const pathless = (() => [{ code: "x" }]) as unknown as Check<string>;
    expect(issuesOf(sync(finish("a", [], undefined, [pathless])))).toEqual([{ code: "x", path: [] }]);
  });

  it("should place an issue whose path a check wrote as undefined at the value too", () => {
    const undefinedPath = (() => [{ code: "x", path: undefined }]) as unknown as Check<string>;
    const [found] = issuesOf(sync(finish("a", [], undefined, [undefinedPath])));
    expect(found?.path).toEqual([]);
  });

  it("should stay synchronous with synchronous checks and turn asynchronous with an asynchronous one", async () => {
    expect(isPending(finish("abc", [], undefined, [short]))).toBe(false);
    const pending = finish("ab", [], undefined, [short, async () => [issue("later")]]);
    expect(isPending(pending)).toBe(true);
    expect(issuesOf(await pending).map((found) => found.code)).toEqual(["too_small", "later"]);
  });
});

describe("leaf", () => {
  it("should report a value of the wrong type with its wording, and run no check", () => {
    const validate = leaf("string", isString, "Text please", [() => [issue("never")]]);
    expect(issuesOf(sync(validate(1)))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "string", received: "number" }, message: "Text please" },
    ]);
  });

  it("should run the checks on the value its inspection returns", () => {
    const validate = leaf<string>("string", isString, undefined, [short], (text) => text.trim());
    expect(validate("  abc  ")).toEqual({ ok: true, value: "abc" });
    expect(issuesOf(sync(validate(" ab "))).map((found) => found.code)).toEqual(["too_small"]);
  });

  it("should run no check when its inspection found an issue", () => {
    let calls = 0;
    const counted: Check<string> = () => {
      calls += 1;
      return undefined;
    };
    const validate = leaf<string>("string", isString, undefined, [counted], (text, issues) => {
      issues.push(issue("too_big"));
      return text;
    });
    expect(issuesOf(sync(validate("abc"))).map((found) => found.code)).toEqual(["too_big"]);
    expect(calls).toBe(0);
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
    expect(split([options])[0]).toBe(options);
  });
});

describe("finish, given a check written by hand", () => {
  it("should throw when a check returns something other than nothing or a list", () => {
    const wrong = (() => false) as unknown as Check<string>;
    expect(() => finish("x", [], undefined, [wrong])).toThrow("A check must return undefined or a list of issues");
  });
});
