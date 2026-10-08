import { describe, expect, it } from "vitest";

import { describe as describeValidator } from "../core/describe";
import type { Validator } from "../core/types";
import { email } from "../formats/email";
import { standard } from "../interop/standard";
import { standardJsonSchema } from "../interop/standard-json-schema";
import { portugueseMessages } from "../messages/portuguese-messages";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { meta } from "./meta";
import { object } from "./object";
import { pick } from "./pick";

const user = object({ name: string({ min: 2 }), email: email() });

function cyclic(): unknown {
  const self: Record<string, unknown> = {};
  self["self"] = self;
  return self;
}

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

  it("should keep a key it was given before, when given it again as undefined", () => {
    const described = meta(meta(number(), { title: "Age" }), { title: undefined, deprecated: true });
    expect(describeValidator(described)?.["meta"]).toEqual({ title: "Age", deprecated: true });
  });

  it("should keep the examples it was given, not a list or an object changed later", () => {
    const address = { city: "Lisbon", lines: ["Rua Augusta"] };
    const examples: unknown[] = ["Ada", address, null, 1.5, true];
    const described = meta(string(), { examples });
    examples.push("Grace");
    address.lines.push("2");
    const kept = describeValidator(described)?.["meta"] as { examples: unknown[] };
    expect(kept).toEqual({ examples: ["Ada", { city: "Lisbon", lines: ["Rua Augusta"] }, null, 1.5, true] });
    expect(Object.isFrozen(kept.examples[1])).toBe(true);
    expect(Object.isFrozen((kept.examples[1] as { lines: unknown }).lines)).toBe(true);
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

  it("should keep the wording of the map standard was given, and not word issues briefly", () => {
    const given = standard(user, portugueseMessages);
    const exposed = meta(given, { title: "User" });
    expect(exposed["~standard"]).toBe(given["~standard"]);
    expect(exposed["~standard"].validate({ name: "Ada", email: "x" })).toEqual(
      given["~standard"].validate({ name: "Ada", email: "x" }),
    );
  });

  it("should keep the JSON Schema of a validator standardJsonSchema made", () => {
    const exposed = meta(standardJsonSchema(user), { title: "User" });
    expect(exposed["~standard"]).toHaveProperty("jsonSchema");
  });

  it("should let pick read the object it describes", () => {
    expect(valueOf(pick(meta(user, { title: "User" }), ["name"])({ name: "Ada" }))).toEqual({ name: "Ada" });
  });

  it.each([
    ["no object", "User", "meta must be an object"],
    ["an unknown key", { titel: "User" }, "Unknown meta titel"],
    ["a title that is not text", { title: 1 }, "meta title must be text"],
    ["a description that is not text", { description: null }, "meta description must be text"],
    ["examples that are not a list", { examples: "Ada" }, "meta examples must be a list of JSON values"],
    ["a bigint example", { examples: [1n] }, "meta examples must be a list of JSON values"],
    ["a Date example", { examples: [new Date(0)] }, "meta examples must be a list of JSON values"],
    ["an undefined example", { examples: [undefined] }, "meta examples must be a list of JSON values"],
    ["a NaN example", { examples: [{ age: Number.NaN }] }, "meta examples must be a list of JSON values"],
    ["a function example", { examples: [() => 1] }, "meta examples must be a list of JSON values"],
    [
      "a list with a hole",
      { examples: [Object.assign([], { 0: 1, 2: 3 })] },
      "meta examples must be a list of JSON values",
    ],
    ["an example that holds itself", { examples: [cyclic()] }, "meta examples must be a list of JSON values"],
    ["a symbol key", { title: "User", [Symbol("hidden")]: 1 }, "Unknown meta Symbol(hidden)"],
    ["deprecated that is not true or false", { deprecated: "yes" }, "meta deprecated must be true or false"],
  ])("should refuse %s when it is made", (_, given, message) => {
    expect(() => meta(string(), given as never)).toThrow(new TypeError(message));
  });

  it("should refuse a validator that is not a function", () => {
    expect(() => meta(undefined as never, {})).toThrow(TypeError);
  });
});
