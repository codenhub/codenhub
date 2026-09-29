import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { accepts, codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { discriminatedUnion } from "./discriminated-union";
import { object } from "./object";

describe("discriminatedUnion", () => {
  const event = discriminatedUnion("type", {
    click: object({ x: number(), y: number() }),
    key: object({ key: string({ min: 1 }) }),
  });

  it("should route by the tag and add the tag back to the output", () => {
    expect(valueOf(event({ type: "key", key: "a" }))).toEqual({ type: "key", key: "a" });
    expect(valueOf(event({ type: "click", x: 1, y: 2 }))).toEqual({ type: "click", x: 1, y: 2 });
  });

  it("should give a tagged union type that narrows on the tag", () => {
    const value = valueOf(event({ type: "click", x: 1, y: 2 }));
    const coordinates = value.type === "click" ? value.x + value.y : 0;
    expect(coordinates).toBe(3);
  });

  it("should report the chosen variant's own issues, not a list of everything", () => {
    expect(issuesOf(event({ type: "click", x: 1 })).map((issue) => [issue.path, issue.code])).toEqual([
      [["y"], "invalid_type"],
    ]);
  });

  it("should reject an unknown, missing or non-string tag with invalid_union at the tag's path", () => {
    for (const input of [{ type: "scroll" }, {}, { type: 1 }, { type: null }]) {
      expect(issuesOf(event(input))).toEqual([
        { code: "invalid_union", path: ["type"], params: { discriminator: "type", options: ["click", "key"] } },
      ]);
    }
  });

  it("should not treat inherited names such as constructor as tags", () => {
    expect(codesOf(event({ type: "constructor" }))).toEqual(["invalid_union"]);
    expect(codesOf(event({ type: "__proto__" }))).toEqual(["invalid_union"]);
  });

  it("should only read the tag from an own property", () => {
    expect(codesOf(event(Object.create({ type: "key" })))).toEqual(["invalid_type"]);
  });

  it("should reject non-objects", () => {
    expect(accepts(event, null, "click", [], undefined)).toEqual([false, false, false, false]);
  });

  it("should nest under the parent's path", () => {
    const form = object({ event });
    expect(issuesOf(form({ event: { type: "nope" } }))[0]?.path).toEqual(["event", "type"]);
  });

  it("should keep the tag first in the output and not let the variant override it", () => {
    expect(Object.keys(valueOf(event({ type: "key", key: "a" })))).toEqual(["type", "key"]);
    const passthrough = discriminatedUnion("type", { a: object({}, { unknownKeys: "passthrough" }) });
    expect(valueOf(passthrough({ type: "a", extra: 1 }))).toEqual({ type: "a", extra: 1 });
  });

  it("should let a strict object be a variant, since the variant does not see the tag", () => {
    const strict = discriminatedUnion("type", { a: object({ x: number() }, { unknownKeys: "strict" }) });
    expect(valueOf(strict({ type: "a", x: 1 }))).toEqual({ type: "a", x: 1 });
    expect(issuesOf(strict({ type: "a", x: 1, y: 2 })).map((issue) => [issue.code, issue.path])).toEqual([
      ["unrecognized_key", ["y"]],
    ]);
  });

  it("should not pass the input's own __proto__ key on as a prototype", () => {
    const passthrough = discriminatedUnion("type", { a: object({}, { unknownKeys: "passthrough" }) });
    const value = valueOf(passthrough(JSON.parse('{"type":"a","__proto__":{"admin":true}}')));
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect((value as { admin?: boolean }).admin).toBeUndefined();
  });

  it("should never put the input in an issue", () => {
    expect(JSON.stringify(issuesOf(event({ type: "hunter2" })))).not.toContain("hunter2");
  });

  it("should give each failure its own list of tags", () => {
    const reported = issuesOf(event({ type: "nope" }))[0]?.params?.options as string[];
    reported.push("nope");
    expect(issuesOf(event({ type: "nope" }))[0]?.params?.options).toEqual(["click", "key"]);
  });

  it("should be asynchronous when a variant is, and answer at once for a bad tag", async () => {
    const asynchronous = discriminatedUnion("kind", { user: object({ name: isFree }), guest: object({}) });
    expect(isPending(asynchronous({ kind: "nope" }))).toBe(false);
    const result = asynchronous({ kind: "user", name: "taken" });
    expect(isPending(result)).toBe(true);
    expect(issuesOf(await result).map((issue) => issue.path)).toEqual([["name"]]);
    expect(isPending(event({ type: "key", key: "a" }))).toBe(false);
  });
});
