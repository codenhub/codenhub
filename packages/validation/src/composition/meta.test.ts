import { describe, expect, it } from "vitest";

import { describe as describeValidator } from "../core/describe";
import type { Validator } from "../core/types";
import { email } from "../formats/email";
import { standard } from "../interop/standard";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { meta } from "./meta";
import { object } from "./object";
import { pick } from "./pick";

const user = object({ name: string({ min: 2 }), email: email() });

describe("meta", () => {
  it("should behave as the validator it was given, with the same results", () => {
    const described = meta(user, { title: "User" });
    const input = { name: "Ada", email: "ada@example.com" };
    expect(described(input)).toEqual(user(input));
    expect(issuesOf(described({ name: "A", email: "nope" }))).toEqual(issuesOf(user({ name: "A", email: "nope" })));
    expect(issuesOf(array(described)([{ name: "A", email: "ada@example.com" }]))[0]?.path).toEqual([0, "name"]);
  });

  it("should add meta to the description of the validator given, and leave that one as it was", () => {
    const name = string({ min: 2 });
    const described = meta(name, { description: "What to call you", examples: ["Ada"] });
    expect(describeValidator(described)).toEqual({
      ...describeValidator(name),
      meta: { description: "What to call you", examples: ["Ada"] },
    });
    expect(describeValidator(name)?.["meta"]).toBeUndefined();
    expect(Object.isFrozen(describeValidator(described)?.["meta"])).toBe(true);
  });

  it("should replace only the keys a second meta names", () => {
    const described = meta(meta(number(), { title: "Age", description: "In years" }), {
      description: "In whole years",
      deprecated: true,
    });
    expect(describeValidator(described)?.["meta"]).toEqual({
      title: "Age",
      description: "In whole years",
      deprecated: true,
    });
  });

  it("should keep the examples it was given, not a list changed later", () => {
    const examples = ["Ada"];
    const described = meta(string(), { examples });
    examples.push("Grace");
    expect(describeValidator(described)?.["meta"]).toEqual({ examples: ["Ada"] });
  });

  it("should give a validator written by hand a description that holds it and the meta", () => {
    const byHand: Validator<string> = (input) =>
      typeof input === "string"
        ? { ok: true, value: input }
        : { ok: false, error: { issues: [{ code: "custom", path: [] }] } };
    const described = meta(byHand, { title: "Text" });
    expect(describeValidator(described)).toEqual({ kind: "meta", inner: byHand, meta: { title: "Text" } });
    expect(valueOf(described("a"))).toBe("a");
  });

  it("should stay synchronous for a synchronous validator, and wait with an asynchronous one", async () => {
    expect(isPending(meta(user, { title: "User" })({ name: "Ada", email: "ada@example.com" }))).toBe(false);
    const result = meta(isFree, { title: "Handle" })("taken");
    expect(isPending(result)).toBe(true);
    expect(codesOf(await result)).toEqual(["taken"]);
  });

  it("should keep the Standard Schema of a validator standard made", () => {
    const exposed = meta(standard(user), { title: "User" });
    expect(exposed["~standard"].validate({ name: "A", email: "ada@example.com" })).toEqual({
      issues: [{ message: "Must be at least 2 characters", path: ["name"] }],
    });
  });

  it("should let pick read the object it describes", () => {
    expect(valueOf(pick(meta(user, { title: "User" }), ["name"])({ name: "Ada" }))).toEqual({ name: "Ada" });
  });

  it.each([
    ["no object", "User", "meta must be an object"],
    ["an unknown key", { titel: "User" }, "Unknown meta titel"],
    ["a title that is not text", { title: 1 }, "meta title must be text"],
    ["a description that is not text", { description: null }, "meta description must be text"],
    ["examples that are not a list", { examples: "Ada" }, "meta examples must be a list"],
    ["deprecated that is not true or false", { deprecated: "yes" }, "meta deprecated must be true or false"],
  ])("should refuse %s when it is made", (_, given, message) => {
    expect(() => meta(string(), given as never)).toThrow(new TypeError(message));
  });

  it("should refuse a validator that is not a function", () => {
    expect(() => meta(undefined as never, {})).toThrow(TypeError);
  });
});
