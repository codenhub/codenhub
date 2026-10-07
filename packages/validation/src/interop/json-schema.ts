import { describe, type Description } from "../core/describe";
import { isPlainObject } from "../core/objects";
import { assertFunction } from "../core/result";
import type { AnyValidator } from "../core/types";

/** A JSON Schema, draft 2020-12 or draft-07, as plain data ready for `JSON.stringify`. */
export interface JsonSchema {
  /** The draft the schema is written in, on the schema `toJsonSchema` returns. */
  $schema?: string;
  /** The definitions a recursive schema refers to, one for each `lazy`. */
  $defs?: Record<string, JsonSchema>;
  /** The same definitions, under the name draft-07 gives them. */
  definitions?: Record<string, JsonSchema>;
  /** The properties of an object. */
  properties?: Record<string, JsonSchema>;
  /** The properties an object must have. */
  required?: string[];
  /** Every other keyword of JSON Schema, such as `type`, `items` or `anyOf`. */
  [keyword: string]: unknown;
}

/** Options for {@link toJsonSchema}. */
export interface JsonSchemaOptions {
  /**
   * Which side of the validator to write. `"input"` is what a value must look like to pass, which is what
   * the body of a request or the arguments of a tool must satisfy. `"output"` is what the validator
   * produces. They differ where a validator changes its value: a default, a coercion, `json`, `fallback`.
   *
   * @defaultValue "input"
   */
  io?: "input" | "output" | undefined;
  /**
   * What to do with a part JSON Schema has no words for, such as a `date`, a `bigint`, the result of a
   * `transform` or a check written by hand. `"throw"` names the part and where it is. `"any"` writes a
   * schema that accepts anything there, and leaves a check out.
   *
   * @defaultValue "throw"
   */
  unrepresentable?: "throw" | "any" | undefined;
  /**
   * The draft of JSON Schema to write. `"draft-07"` is for a reader that does not know 2020-12, such as
   * some tools of language models: it writes a tuple with `items` and `additionalItems`, definitions under
   * `definitions`, and leaves out the `contentSchema` of `json`, which that draft has no word for.
   *
   * @defaultValue "draft-2020-12"
   */
  target?: "draft-2020-12" | "draft-07" | undefined;
}

/** The formats JSON Schema names otherwise than this package does. Any other is written under its own name. */
const FORMAT_NAMES: Readonly<Record<string, string>> = {
  url: "uri",
  datetime: "date-time",
  isoDate: "date",
  domain: "hostname",
};

/** What each coercing validator accepts beside its own type, by the kind of its strict validator. */
const COERCED_TYPES: Readonly<Record<string, readonly string[]>> = {
  string: ["string", "number", "boolean"],
  number: ["number", "string"],
  boolean: ["boolean", "string", "number"],
  bigint: ["integer", "string"],
  date: ["string", "integer"],
};

/** How many definitions may be open at once, one inside another, before a schema is taken to build itself anew. */
const MAX_OPEN_DEFINITIONS = 64;

const isUndefinedLiteral = (record: Description | undefined): boolean =>
  record?.kind === "literal" && record["value"] === undefined;

const escapeForPattern = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|/-]/g, String.raw`\$&`);

const isJsonPrimitive = (value: unknown): boolean =>
  value === null || typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);

/**
 * Writes a validator as a JSON Schema, draft 2020-12 unless `target` asks for draft-07, for whatever takes
 * one: the body of an HTTP API, the arguments of a tool a language model calls, a form generator.
 *
 * @remarks
 * The schema is read from what {@link describe} gives, so only validators made by this package's
 * factories can be written. It is written so that a value the validator accepts passes it, with the
 * exceptions below, and it accepts some the validator refuses, since a validator checks more than a
 * schema can say: a format's exact rules, such as which hosts of an `email` are public, are written as
 * the nearest JSON Schema `format`.
 *
 * The exceptions are where a validator cleans a value before it checks it, which is not written.
 * `string({ trim: true, max: 5 })` is written with `maxLength: 5`, which describes text that needs no
 * trimming; text with spaces around five letters passes the validator and not the schema. A `case`, and
 * a `clamp` beside a limit, are the same. Lengths differ for a character outside the Basic Multilingual
 * Plane, such as an emoji, which a string's `length` counts as two and JSON Schema as one.
 *
 * A recursive schema is written with `$ref` and one definition for each `lazy`, under `$defs` in draft
 * 2020-12 and under `definitions` in draft-07.
 *
 * @example
 * ```ts
 * const user = object({ name: string({ min: 2 }), email: email(), age: optional(number({ int: true })) });
 * toJsonSchema(user);
 * // {
 * //   $schema: "https://json-schema.org/draft/2020-12/schema",
 * //   type: "object",
 * //   properties: {
 * //     name: { type: "string", minLength: 2 },
 * //     email: { type: "string", format: "email" },
 * //     age: { type: "integer" },
 * //   },
 * //   required: ["name", "email"],
 * // }
 * ```
 *
 * @param validator - A validator made by a factory of this package.
 * @param options - Which side to write, and what to do with a part that cannot be written.
 * @returns The schema, as a new plain object.
 * @throws {TypeError} When a part cannot be written and `unrepresentable` is `"throw"`, naming the part
 * and its place, or when an option is not one of its values.
 */
export function toJsonSchema(validator: AnyValidator, options: JsonSchemaOptions = {}): JsonSchema {
  assertFunction("validator", validator);
  if (!isPlainObject(options)) {
    throw new TypeError("options must be an object");
  }
  const { io = "input", unrepresentable = "throw", target = "draft-2020-12" } = options;
  if (io !== "input" && io !== "output") {
    throw new TypeError(`io must be "input" or "output", received "${String(io)}"`);
  }
  if (unrepresentable !== "throw" && unrepresentable !== "any") {
    throw new TypeError(`unrepresentable must be "throw" or "any", received "${String(unrepresentable)}"`);
  }
  if (target !== "draft-2020-12" && target !== "draft-07") {
    throw new TypeError(`target must be "draft-2020-12" or "draft-07", received "${String(target)}"`);
  }
  const isInput = io === "input";
  const isDraft07 = target === "draft-07";
  const definitionsKey = isDraft07 ? "definitions" : "$defs";
  const definitions: Record<string, JsonSchema> = {};
  // Keyed by the getter of a `lazy`, which is the same function wherever a schema built anew at each level
  // names it, where the `lazy` and what the getter returns are new each time.
  const names = new Map<unknown, string>();
  let open = 0;

  const refuse = (what: string, path: string): undefined => {
    if (unrepresentable === "throw") {
      throw new TypeError(
        `toJsonSchema cannot write ${what} at ${path === "" ? "the root" : path}. Pass { unrepresentable: "any" } to accept anything there`,
      );
    }
    return undefined;
  };

  /** Whether an object may leave out the property this validator checks. A validator that cannot be read may. */
  const mayBeAbsent = (target: unknown, seen: Set<unknown>): boolean => {
    const record = describe(target as AnyValidator);
    if (record === undefined || seen.has(target)) {
      return record === undefined;
    }
    seen.add(target);
    const inner = (): boolean => mayBeAbsent(record["inner"], seen);
    switch (record.kind) {
      case "nullish":
      case "unknown":
        return true;
      case "optional":
        return isInput || record["default"] === undefined;
      case "fallback":
        return isInput || inner();
      case "nullable":
      case "readonly":
      case "transform":
      case "meta":
        return inner();
      case "lazy":
        return mayBeAbsent((record["getter"] as () => unknown)(), seen);
      case "pipe":
        return mayBeAbsent((record["steps"] as unknown[]).at(isInput ? 0 : -1), seen);
      case "codec":
        return mayBeAbsent(record[isInput ? "input" : "output"], seen);
      case "union":
        return (record["members"] as unknown[]).some((member) => mayBeAbsent(member, seen));
      case "intersection":
        return (record["members"] as unknown[]).every((member) => mayBeAbsent(member, seen));
      case "literal":
        return record["value"] === undefined;
      case "oneOf":
        return (record["values"] as unknown[]).includes(undefined);
      default:
        return false;
    }
  };

  /** Adds what each check requires to the schema of the value it checks. */
  const applyChecks = (schema: JsonSchema, record: Description, path: string): JsonSchema => {
    const patterns: string[] = [];
    for (const check of record.checks ?? []) {
      // A check written by hand has no description, so no format, and is refused below.
      const made = describe(check);
      const params = (made?.["params"] ?? {}) as Record<string, unknown>;
      const by = made?.["by"];
      const { format, value } = params;
      if (format === "regex") {
        const written = String(params["pattern"]);
        const end = written.lastIndexOf("/");
        // A flag such as `i` or `m` changes what the pattern accepts, and JSON Schema has no flags.
        // `g` and `y` change nothing: the check drops them.
        if (/^g?[uv]?y?$/.test(written.slice(end + 1))) {
          patterns.push(written.slice(1, end));
        } else {
          refuse("a pattern with flags", path);
        }
      } else if (format === "startsWith") {
        patterns.push(`^${escapeForPattern(String(value))}`);
      } else if (format === "endsWith") {
        patterns.push(`${escapeForPattern(String(value))}$`);
      } else if (format === "includes") {
        patterns.push(escapeForPattern(String(value)));
      } else if (format === "nonBlank") {
        patterns.push(String.raw`\S`);
      } else if (format === "multipleOf" && typeof value === "number") {
        schema["multipleOf"] = value;
      } else if (format === "nonZero") {
        schema["not"] = { const: 0 };
      } else if (params["unique"] === true && by === undefined) {
        schema["uniqueItems"] = true;
      } else {
        refuse(format === undefined ? "a check that cannot be read" : `the check ${String(format)}`, path);
      }
    }
    const [first, ...others] = patterns;
    if (first !== undefined) {
      schema["pattern"] = first;
    }
    if (others.length > 0) {
      // Added to the `allOf` an intersection has of its members, which is what its checks are written on.
      schema["allOf"] = [
        ...((schema["allOf"] as JsonSchema[] | undefined) ?? []),
        ...others.map((pattern) => ({ pattern })),
      ];
    }
    return schema;
  };

  const sizes = (schema: JsonSchema, given: Record<string, unknown>, lower: string, upper: string): JsonSchema => {
    const { min, max, length } = given;
    if ((length ?? min) !== undefined) {
      schema[lower] = length ?? min;
    }
    if ((length ?? max) !== undefined) {
      schema[upper] = length ?? max;
    }
    return schema;
  };

  /** The schema of a part, with what `meta` says of it. */
  const convert = (target: unknown, path: string): JsonSchema => {
    const schema = write(target, path);
    const said = describe(target as AnyValidator)?.["meta"];
    return said === undefined ? schema : { ...schema, ...(said as object) };
  };

  const write = (target: unknown, path: string): JsonSchema => {
    const record = describe(target as AnyValidator);
    if (record === undefined) {
      return refuse("a validator written by hand", path) ?? {};
    }
    const given = (record.options ?? {}) as Record<string, unknown>;
    const child = (name: string, at = path): JsonSchema => convert(record[name], at);
    const list = (name: string, at: (index: number) => string = () => path): JsonSchema[] =>
      (record[name] as unknown[]).map((each, index) => convert(each, at(index)));
    const checked = (schema: JsonSchema): JsonSchema => applyChecks(schema, record, path);
    const anything = (what: string): JsonSchema => refuse(what, path) ?? {};
    /**
     * The schema of a validator that wraps another and takes checks of its own. They are written beside
     * the inner schema and not into it, where a keyword of one, such as `pattern`, would replace the other's.
     */
    const over = (inner: JsonSchema): JsonSchema => {
      const own = checked({});
      return Object.keys(own).length === 0 ? inner : { allOf: [inner, own] };
    };
    /** A schema no value passes when `schemas` is empty, which `anyOf` and `enum` may not be. */
    const none = (schemas: readonly unknown[], schema: JsonSchema): JsonSchema =>
      checked(schemas.length === 0 ? { not: {} } : schema);

    switch (record.kind) {
      case "string":
        return checked(sizes({ type: "string" }, given, "minLength", "maxLength"));
      case "number": {
        const schema: JsonSchema = { type: given["int"] === true || given["safeInt"] === true ? "integer" : "number" };
        for (const [option, keyword] of [
          ["min", "minimum"],
          ["max", "maximum"],
          ["gt", "exclusiveMinimum"],
          ["lt", "exclusiveMaximum"],
        ] as const) {
          // A bound of an infinity shuts nothing out, and JSON has no value for one.
          if (Number.isFinite(given[option])) {
            schema[keyword] = given[option];
          }
        }
        return checked(schema);
      }
      case "boolean":
        return checked({ type: "boolean" });
      case "unknown":
        return checked({});
      case "never":
        return { not: {} };
      case "literal":
        return isJsonPrimitive(record["value"])
          ? checked({ const: record["value"] })
          : anything("a literal JSON has no value for");
      case "oneOf": {
        const values = record["values"] as unknown[];
        const present = values.filter((value) => value !== undefined);
        return present.every(isJsonPrimitive)
          ? none(present, { enum: present })
          : anything("a value JSON has none for");
      }
      case "format": {
        const name = String(record["format"]);
        if (name === "port") {
          return checked({ type: "integer", minimum: 1, maximum: 65_535 });
        }
        if (name === "base64") {
          return checked({ type: "string", contentEncoding: given["url"] === true ? "base64url" : "base64" });
        }
        if (name === "ip" && given["version"] !== undefined) {
          return checked({ type: "string", format: `ip${String(given["version"])}` });
        }
        return checked(
          name === "ip"
            ? { type: "string", anyOf: [{ format: "ipv4" }, { format: "ipv6" }] }
            : { type: "string", format: FORMAT_NAMES[name] ?? name },
        );
      }
      case "coerce": {
        const types = COERCED_TYPES[describe(record["inner"] as AnyValidator)?.kind ?? ""];
        return isInput && types !== undefined ? { type: [...types] } : child("inner");
      }
      case "object":
      case "objectLike": {
        const shape = Object.entries(record["shape"] as Record<string, unknown>);
        // Made from entries, which defines each property, so a key such as `__proto__` is a property here too.
        const schema: JsonSchema = {
          type: "object",
          properties: Object.fromEntries(
            shape.map(([key, each]) => [key, convert(each, path === "" ? key : `${path}.${key}`)]),
          ),
        };
        const required = shape.filter(([, each]) => !mayBeAbsent(each, new Set())).map(([key]) => key);
        if (required.length > 0) {
          schema["required"] = required;
        }
        if (given["unknownKeys"] === "strict") {
          schema["additionalProperties"] = false;
        }
        return checked(schema);
      }
      case "array":
        return checked(sizes({ type: "array", items: child("item", `${path}[]`) }, given, "minItems", "maxItems"));
      case "tuple": {
        const prefixItems = list("items", (index) => `${path}[${index}]`);
        const rest = record["rest"] === undefined ? false : child("rest", `${path}[]`);
        // Draft-07 lists the items of a tuple under `items`, and the rest under `additionalItems`.
        const schema: JsonSchema = isDraft07
          ? { type: "array", items: prefixItems, minItems: prefixItems.length, additionalItems: rest }
          : { type: "array", prefixItems, minItems: prefixItems.length, items: rest };
        if (given["max"] !== undefined) {
          schema["maxItems"] = given["max"];
        }
        return checked(schema);
      }
      case "record":
        return checked(
          sizes(
            {
              type: "object",
              propertyNames: child("key", `${path}{}`),
              additionalProperties: child("value", `${path}{}`),
            },
            given,
            "minProperties",
            "maxProperties",
          ),
        );
      case "union": {
        // `literal(undefined)` in a union says the value may be absent, which an object says by not requiring it.
        const members = (record["members"] as unknown[]).filter(
          (member) => !isUndefinedLiteral(describe(member as AnyValidator)),
        );
        return none(members, { anyOf: members.map((member) => convert(member, path)) });
      }
      case "intersection":
        return checked({ allOf: list("members") });
      case "tagged": {
        const key = String(record["key"]);
        const variants = Object.entries(record["variants"] as Record<string, unknown>).map(([tag, variant]) => {
          const schema = convert(variant, path);
          // `tagged` takes the tag out before its variant sees the value, so the tag is written into the
          // variant's own properties: beside them, a strict variant would refuse it.
          if (schema["type"] !== "object" || !isPlainObject(schema["properties"])) {
            return anything("a variant that is not an object");
          }
          return {
            ...schema,
            properties: Object.fromEntries([[key, { const: tag }], ...Object.entries(schema["properties"])]),
            required: [key, ...((schema["required"] as string[] | undefined) ?? [])],
          };
        });
        return checked({ oneOf: variants });
      }
      case "optional": {
        const fallback = record["default"];
        return isInput && isJsonPrimitive(fallback) ? { ...child("inner"), default: fallback } : child("inner");
      }
      case "nullable":
      case "nullish":
        return { anyOf: [child("inner"), { type: "null" }] };
      case "readonly":
      case "meta":
        return child("inner");
      case "fallback":
        return isInput ? {} : child("inner");
      case "transform":
        return isInput ? child("inner") : anything("what a transform returns");
      case "pipe":
        return convert((record["steps"] as unknown[]).at(isInput ? 0 : -1), path);
      case "codec":
        return child(isInput ? "input" : "output");
      case "lazy": {
        const getter = record["getter"] as () => unknown;
        let name = names.get(getter);
        if (name === undefined) {
          // A getter written where the schema is built, as in `lazy(() => build())`, is a new function at
          // every level, and would be followed until the stack ran out.
          if (open >= MAX_OPEN_DEFINITIONS) {
            throw new TypeError(
              "toJsonSchema found a recursive schema that is built anew at every level. Build it once and refer to it",
            );
          }
          name = `schema${names.size + 1}`;
          names.set(getter, name);
          open += 1;
          try {
            definitions[name] = convert(getter(), path);
          } finally {
            open -= 1;
          }
        }
        // The checks are of this `lazy` and not of its getter, which another `lazy` may share.
        return over({ $ref: `#/${definitionsKey}/${name}` });
      }
      case "json": {
        const parsed = (): JsonSchema => (record["inner"] === undefined ? checked({}) : over(child("inner")));
        if (!isInput) {
          return parsed();
        }
        // Draft-07 has no `contentSchema`, and leaving it out only accepts more, as the schema may, so what
        // is parsed is not read and cannot make the schema throw.
        return isDraft07
          ? { type: "string", contentMediaType: "application/json" }
          : { type: "string", contentMediaType: "application/json", contentSchema: parsed() };
      }
      case "searchParams":
        return isInput ? { type: "string" } : over(child("inner"));
      default:
        return anything(
          record.kind === "guard"
            ? `a guard for ${String(record["expected"])}`
            : `a validator of kind "${record.kind}"`,
        );
    }
  };

  const schema = convert(validator, "");
  return {
    $schema: isDraft07 ? "http://json-schema.org/draft-07/schema#" : "https://json-schema.org/draft/2020-12/schema",
    ...schema,
    ...(names.size > 0 && { [definitionsKey]: definitions }),
  };
}
