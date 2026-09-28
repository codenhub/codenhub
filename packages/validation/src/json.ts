import { NEVER, type Validator } from "./core";
import { type Message } from "./issue";
import { StringValidator } from "./string";

/**
 * Creates a validator for strings holding JSON, which outputs the parsed value.
 *
 * @example
 * ```ts
 * const settings = val.json(val.object({ theme: val.enum(["light", "dark"]) }));
 * settings.parse('{"theme":"dark"}'); // { theme: "dark" }
 * ```
 *
 * @typeParam TOutput - Type of the parsed value.
 * @param schema - Validator the parsed value must satisfy. Any value is accepted when omitted.
 * @param message - Message when the input is not valid JSON.
 * @returns A validator whose output is the parsed, validated value.
 */
export function json<TOutput = unknown>(schema?: Validator<TOutput>, message?: Message): Validator<TOutput> {
  const parsed = new StringValidator().transform((text, ctx) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      ctx.addIssue({
        code: "invalid_format",
        message: message ?? "Invalid JSON",
        params: { format: "json" },
        input: text,
      });
      return NEVER;
    }
  });
  return (schema === undefined ? parsed : parsed.pipe(schema)) as Validator<TOutput>;
}
