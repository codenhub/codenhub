import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { describe as describeValidator } from "../core/describe";
import { toJsonSchema } from "../interop/json-schema";
import { string } from "../primitives/string";
import { isPending, valueOf } from "../test-utils";
import { brand } from "./brand";
import { object } from "./object";
import { pick } from "./pick";

describe("brand", () => {
  it("should return the validator it was given, so nothing changes at run time", () => {
    const name = string({ min: 2 });
    const branded = brand(name, "Name");
    expect(branded).toBe(name);
    expect(valueOf(branded("Ada"))).toBe("Ada");
    expect(branded("A").ok).toBe(false);
    expect(describeValidator(branded)).toBe(describeValidator(name));
  });

  it("should leave an object readable by what reads a schema", () => {
    const user = brand(object({ id: brand(string(), "UserId"), name: string() }), "User");
    expect(toJsonSchema(user)).toMatchObject({ type: "object", required: ["id", "name"] });
    expect(valueOf(pick(user, ["id"])({ id: "a", name: "b" }))).toEqual({ id: "a" });
  });

  it("should keep an asynchronous validator asynchronous", async () => {
    const taken = brand(string(check(async () => true)), "Free");
    const result = taken("ada");
    expect(isPending(result)).toBe(true);
    expect(valueOf(await result)).toBe("ada");
  });

  it("should refuse what is not a validator, and a name that is not text", () => {
    expect(() => brand("string" as never, "Name")).toThrow(TypeError);
    expect(() => brand(string(), 5 as never)).toThrow(TypeError);
  });
});
