import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { codesOf, isFree, isPending, valueOf } from "../test-utils";
import { array } from "./array";
import { object } from "./object";
import { optional } from "./optional";
import { withDefault } from "./with-default";

describe("withDefault", () => {
  const role = withDefault(oneOf(["admin", "user"]), "user");

  it("should replace undefined with the default", () => {
    expect(valueOf(role(undefined))).toBe("user");
  });

  it("should give every other value to the wrapped validator, including invalid ones", () => {
    expect(valueOf(role("admin"))).toBe("admin");
    expect(codesOf(role("guest"))).toEqual(["invalid_value"]);
    expect(role(null).ok).toBe(false);
  });

  it("should trust the default and not validate it", () => {
    const loose = withDefault(number({ min: 10 }), 1);
    expect(valueOf(loose(undefined))).toBe(1);
  });

  it("should call a function default every time, so objects are not shared", () => {
    const tags = withDefault(array(string()), () => []);
    const first = valueOf(tags(undefined));
    first.push("x");
    expect(valueOf(tags(undefined))).toEqual([]);
  });

  it("should share a plain value default between results", () => {
    const shared: string[] = [];
    const tags = withDefault(array(string()), shared);
    expect(valueOf(tags(undefined))).toBe(shared);
  });

  it("should make the property required in the output type of an object", () => {
    const settings = object({ role, note: optional(string()) });
    const output: { role: "admin" | "user"; note?: string | undefined } = valueOf(settings({}));
    expect(output).toEqual({ role: "user" });
  });

  it("should answer at once for undefined even when the wrapped validator is asynchronous", async () => {
    const validator = withDefault(isFree, "fresh");
    expect(isPending(validator(undefined))).toBe(false);
    expect(valueOf(validator(undefined) as never)).toBe("fresh");
    expect(codesOf(await validator("taken"))).toEqual(["taken"]);
  });
});
