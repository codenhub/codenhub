import { isPlainObject } from "../core/objects";
import type { AnyValidator, Infer, InferInput } from "../core/types";
import { englishMessages } from "../messages/english-messages";
import type { Messages } from "../messages/word";
import { toJsonSchema, type JsonSchemaOptions } from "./json-schema";
import { standard } from "./standard";
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "./standard-schema";

/**
 * Makes a validator usable wherever a Standard Schema is accepted, as `standard` does, and also wherever
 * one that can be written as a JSON Schema is, such as the tools of a language model in the AI SDK.
 *
 * @remarks
 * What it returns is what `standard` returns with `~standard.jsonSchema` added, from the [Standard JSON
 * Schema](https://standardschema.dev/json-schema) specification: `input({ target })` and
 * `output({ target })` write the validator with `toJsonSchema`, its `io` and `target` as asked. Targets
 * `"draft-2020-12"` and `"draft-07"` are written, and any other throws a `TypeError`, as the specification
 * asks. A part of the validator JSON Schema cannot say, such as a custom check, throws too, unless
 * `libraryOptions` is `{ unrepresentable: "any" }`.
 *
 * It is an export of its own so that `standard`, which a form in the browser uses, does not bundle the
 * code that writes a JSON Schema. Give `meta` to the validator before passing it here: the schema is
 * written from the validator this is given.
 *
 * @example
 * ```ts
 * // `tool` is the AI SDK's.
 * const weather = tool({
 *   description: "Get the weather in a city",
 *   inputSchema: standardJsonSchema(object({ city: meta(string({ max: 100 }), { description: "The city" }) })),
 *   execute: async ({ city }) => lookUp(city),
 * });
 * ```
 *
 * @typeParam TValidator - The validator to expose.
 * @param validator - A validator made by the factories of this package.
 * @param messages - Text for the issue codes, as `standard` takes it. Defaults to `englishMessages`.
 * @returns A validator that is also a Standard Schema and a Standard JSON Schema.
 * @throws {TypeError} When `validator` is not a function, or `messages` is not a message map.
 */
export function standardJsonSchema<TValidator extends AnyValidator>(
  validator: TValidator,
  messages: Messages = englishMessages,
): TValidator &
  StandardSchemaV1<InferInput<TValidator>, Infer<TValidator>> &
  StandardJSONSchemaV1<InferInput<TValidator>, Infer<TValidator>> {
  const exposed = standard(validator, messages);
  const writer =
    (io: "input" | "output") =>
    (options: StandardJSONSchemaV1.Options): Record<string, unknown> => {
      // The specification makes `target` required, so leaving it out is refused as an unknown one is, and
      // not read as the default draft.
      if (!isPlainObject(options) || options.target === undefined) {
        throw new TypeError("options must be an object with a target");
      }
      const unrepresentable = options.libraryOptions?.["unrepresentable"];
      return toJsonSchema(validator, {
        io,
        target: options.target as JsonSchemaOptions["target"],
        unrepresentable: unrepresentable as JsonSchemaOptions["unrepresentable"],
      });
    };
  const props = exposed["~standard"];
  // The wrapper `standard` made is this function's own, so its property is replaced, not the validator's.
  return Object.assign(exposed, {
    "~standard": { ...props, jsonSchema: { input: writer("input"), output: writer("output") } },
  }) as TValidator &
    StandardSchemaV1<InferInput<TValidator>, Infer<TValidator>> &
    StandardJSONSchemaV1<InferInput<TValidator>, Infer<TValidator>>;
}
