import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { nonBlank } from "../checks/non-blank";
import { string } from "../primitives/string";
import { issuesOf, isPending } from "../test-utils";
import { issue } from "./result";
import type { Check, ValidationResult } from "./types";

const short = check((value: string) => (value.length < 3 ? [issue("too_small")] : []));
const noSpaces = check((value: string) => (value.includes(" ") ? [issue("spaces")] : []));
const sync = <T>(result: unknown): ValidationResult<T> => result as ValidationResult<T>;

describe("the checks of a validator", () => {
  it("should pass the value when nothing was found", () => {
    expect(string(short)("value")).toEqual({ ok: true, value: "value" });
  });

  it("should report every check's issues, worded unless a check worded its own", () => {
    const worded = check(() => [{ code: "worded", path: [], message: "Mine" }]);
    expect(issuesOf(string({ message: "Own" }, short, noSpaces, worded)("a b"))).toEqual([
      { code: "spaces", path: [], message: "Own" },
      { code: "worded", path: [], message: "Mine" },
    ]);
  });

  it("should run no check once the validator found an issue of its own, and report that one alone", () => {
    let calls = 0;
    const counted = check(() => {
      calls += 1;
      return [issue("checked")];
    });
    expect(
      issuesOf(string({ max: 2, message: "Own" }, counted, noSpaces)("a b")).map(({ code, message }) => [
        code,
        message,
      ]),
    ).toEqual([["too_big", "Own"]]);
    expect(calls).toBe(0);
  });

  it("should run no check on a value of the wrong type, and report it with the validator's wording", () => {
    const validate = string(
      { message: "Text please" },
      check(() => [issue("never")]),
    );
    expect(issuesOf(validate(1))).toEqual([
      { code: "invalid_type", path: [], params: { expected: "string", received: "number" }, message: "Text please" },
    ]);
  });

  it("should stay synchronous when its own issue stops an asynchronous check", () => {
    let calls = 0;
    const later = check(async () => {
      calls += 1;
      return true;
    });
    const result = string({ min: 2 }, later)("a");
    expect(isPending(result)).toBe(false);
    expect(issuesOf(sync(result)).map((found) => found.code)).toEqual(["too_small"]);
    expect(calls).toBe(0);
  });

  it("should run the checks on the value the validator produced", () => {
    const validate = string({ trim: true }, short);
    expect(validate("  abc  ")).toEqual({ ok: true, value: "abc" });
    expect(issuesOf(validate(" ab ")).map((found) => found.code)).toEqual(["too_small"]);
  });

  it("should copy a check's issues, so a list the check reuses is never changed", () => {
    const reused = Object.freeze([Object.freeze(issue("reused"))]);
    const validate = string(
      { message: "Worded" },
      check(() => reused),
    );
    expect(issuesOf(validate("a"))).toEqual([{ code: "reused", path: [], message: "Worded" }]);
    expect(issuesOf(validate("a"))).toEqual([{ code: "reused", path: [], message: "Worded" }]);
    expect(reused[0]).toEqual({ code: "reused", path: [] });
  });

  it("should place an issue a check wrote by hand without a path at the value", () => {
    const pathless = check(() => [{ code: "x" }]);
    expect(issuesOf(string(pathless)("a"))).toEqual([{ code: "x", path: [] }]);
  });

  it("should place an issue whose path a check wrote as undefined at the value too", () => {
    const undefinedPath = check(() => [{ code: "x", path: undefined }]);
    const [found] = issuesOf(string(undefinedPath)("a"));
    expect(found?.path).toEqual([]);
  });

  it("should keep the path a check wrote, root first", () => {
    const deep = check(() => [{ code: "x", path: ["a", 0, "b"] }]);
    expect(issuesOf(string(deep)("a"))).toEqual([{ code: "x", path: ["a", 0, "b"] }]);
  });

  it("should stay synchronous with synchronous checks and turn asynchronous with an asynchronous one", async () => {
    expect(isPending(string(short)("abc"))).toBe(false);
    const pending = string(
      short,
      check(async () => [issue("later")]),
    )("ab");
    expect(isPending(pending)).toBe(true);
    expect(issuesOf(await pending).map((found) => found.code)).toEqual(["too_small", "later"]);
  });
});

describe("a function that check() did not make", () => {
  const bare = ((value: string) => (value.length < 3 ? [issue("too_small")] : undefined)) as Check<string>;

  it("should be refused as a check when the validator is created, since nothing in the validator runs it", () => {
    expect(() => string(bare)).toThrow("checks made with check()");
    expect(() => string({ min: 1 }, short, bare)).toThrow(TypeError);
  });

  it("should be refused after a built-in rule too, which carries no code to run it", () => {
    expect(() => string(nonBlank(), bare)).toThrow("checks made with check()");
  });
});

describe("the test of a check", () => {
  const wrong = "The test of a check must return a boolean or a list of issues";

  it.each([
    ["nothing, as a test that forgot to return does", undefined],
    ["null", null],
    ["an issue outside a list", { code: "x" }],
    ["text", "no"],
  ])("should throw when it returns %s, which read as a pass would accept every value", (_, answer) => {
    const forgetful = check((() => answer) as unknown as () => boolean);
    expect(() => string(forgetful)("x")).toThrow(wrong);
  });

  it("should throw when it resolves to something other than a boolean or a list", async () => {
    const forgetful = check((async () => undefined) as unknown as () => Promise<boolean>);
    await expect(string(forgetful)("x")).rejects.toThrow(wrong);
  });

  it("should throw when an issue's path is not a list of keys and indexes, which a composer could not place", () => {
    const textPath = check((() => [{ code: "x", path: "confirm" }]) as unknown as () => boolean);
    expect(() => string(textPath)("x")).toThrow("issue.path must be a list of keys and indexes");
  });

  it("should throw when what it lists is not an issue", () => {
    const listed = check((() => ["too short"]) as unknown as () => boolean);
    expect(() => string(listed)("x")).toThrow("An issue must be an object");
  });

  it("should pass a value for true and for an empty list, and refuse it for false", () => {
    expect(string(check(() => true))("x").ok).toBe(true);
    expect(string(check(() => []))("x").ok).toBe(true);
    expect(issuesOf(string(check(() => false))("x"))).toEqual([{ code: "custom", path: [] }]);
  });
});
