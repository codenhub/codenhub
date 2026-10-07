import { describe, expect, expectTypeOf, it } from "vitest";

import { coerceNumber } from "../coercion/coerce-number";
import { meta } from "../composition/meta";
import { object } from "../composition/object";
import { describe as describeValidator } from "../core/describe";
import { email } from "../formats/email";
import { portugueseMessages } from "../messages/portuguese-messages";
import { date } from "../primitives/date";
import { string } from "../primitives/string";
import { toJsonSchema } from "./json-schema";
import { standardJsonSchema } from "./standard-json-schema";
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "./standard-schema";

const signup = object({
  email: meta(email(), { description: "Where to write" }),
  age: coerceNumber({ int: true }),
});

describe("standardJsonSchema", () => {
  it("should be a Standard Schema that validates as standard does", () => {
    const exposed = standardJsonSchema(signup);
    expect(exposed["~standard"]).toMatchObject({ version: 1, vendor: "codenhub" });
    expect(exposed["~standard"].validate({ email: "nope", age: "3" })).toEqual({
      issues: [{ message: "Invalid email address", path: ["email"] }],
    });
    expect(standardJsonSchema(string({ min: 2 }), portugueseMessages)["~standard"].validate("a")).toEqual({
      issues: [{ message: "Deve ter no mínimo 2 caracteres", path: [] }],
    });
  });

  it("should write the input and output as toJsonSchema does, in the draft asked for", () => {
    const { jsonSchema } = standardJsonSchema(signup)["~standard"];
    expect(jsonSchema.input({ target: "draft-2020-12" })).toEqual(toJsonSchema(signup));
    expect(jsonSchema.input({ target: "draft-07" })).toEqual(toJsonSchema(signup, { target: "draft-07" }));
    expect(jsonSchema.output({ target: "draft-07" })).toEqual(
      toJsonSchema(signup, { io: "output", target: "draft-07" }),
    );
  });

  it("should throw for a target it does not write, and for a part that cannot be written unless told", () => {
    const { jsonSchema } = standardJsonSchema(object({ at: date() }))["~standard"];
    expect(() => jsonSchema.input({ target: "openapi-3.0" })).toThrow(TypeError);
    expect(() => jsonSchema.input({ target: "draft-07" })).toThrow("cannot write");
    expect(jsonSchema.input({ target: "draft-07", libraryOptions: { unrepresentable: "any" } })).toMatchObject({
      properties: { at: {} },
    });
  });

  it("should behave and be described as the validator it wraps, and leave it as it was", () => {
    const exposed = standardJsonSchema(signup);
    expect(exposed({ email: "ada@example.com", age: 3 })).toEqual(signup({ email: "ada@example.com", age: 3 }));
    expect(describeValidator(exposed)).toBe(describeValidator(signup));
    expect("~standard" in signup).toBe(false);
  });

  it("should be typed as both specifications", () => {
    const exposed = standardJsonSchema(signup);
    expectTypeOf(exposed).toExtend<
      StandardSchemaV1<{ email: string; age: string | number }, { email: string; age: number }>
    >();
    expectTypeOf(exposed).toExtend<
      StandardJSONSchemaV1<{ email: string; age: string | number }, { email: string; age: number }>
    >();
  });
});
