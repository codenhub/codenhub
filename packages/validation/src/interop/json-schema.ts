import { isBinaryExact } from "../checks/multiple-of";
import { customFormats, describe, type Description } from "../core/describe";
import { makesNewLazy } from "../core/lazy";
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

/**
 * The formats written with a JSON Schema `format`, under JSON Schema's name, for the input and the output
 * side. Any other is written with none: Ajv in its default strict mode refuses to compile a format it does
 * not know, such as `phone`, so a name of this package's own, or of a `format()`, would make the whole
 * schema unusable there. An empty name is a format whose text the format of that name may refuse: RFC
 * 3339's `time` needs an offset and its `duration` has no fraction and no weeks beside days, a URL may
 * hold `|`, which a URI may not, and an IPv6 address a zone, `fe80::1%eth0`, which `ipv6` refuses. An
 * `email` and a `domain` read Unicode and produce ASCII, so only their output is `email` or `hostname`:
 * `idn-email` and `idn-hostname` would fit their input, but ajv-formats has neither.
 */
const FORMAT_NAMES: Readonly<Record<string, readonly [input: string, output: string]>> = {
  uuid: ["uuid", "uuid"],
  hostname: ["hostname", "hostname"],
  ip: ["", ""],
  datetime: ["date-time", "date-time"],
  isoDate: ["date", "date"],
  email: ["", "email"],
  domain: ["", "hostname"],
};

/**
 * What each coercing validator accepts beside its own type, by the kind of its strict validator. A
 * `bigint` and a `date` are no JSON value, so for them it is all the coercion accepts.
 */
const COERCED_TYPES: Readonly<Record<string, readonly string[]>> = {
  string: ["number", "boolean"],
  number: ["string"],
  boolean: ["string", "number"],
  bigint: ["integer", "string"],
  date: ["string", "integer"],
};

const OPTION_NAMES = ["io", "unrepresentable", "target"];

/**
 * How many definitions whose getter makes new `lazy` parts each time it is called may be open at once, one
 * inside another, before a schema is taken to build itself anew.
 */
const MAX_OPEN_DEFINITIONS = 64;

const isUndefinedLiteral = (record: Description | undefined): boolean =>
  record?.kind === "literal" && record["value"] === undefined;

// Only the characters Unicode mode, in which a schema reads a pattern, allows escaped: `\-` is an error there.
const escapeForPattern = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|/]/g, String.raw`\$&`);

/**
 * Whether a pattern written without the `u` flag means the same in Unicode mode, but for what `.` and a
 * negated class match. `\u{41}` and `\p{L}` are escapes only there, and text with braces without it.
 */
const readsAlikeInUnicode = (source: string): boolean => {
  if (/\\[pPu]\{/.test(source)) {
    return false;
  }
  try {
    RegExp(source, "u");
    return true;
  } catch {
    return false;
  }
};

const isJsonPrimitive = (value: unknown): boolean =>
  value === null || typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);

/** The kinds whose output is a primitive, which `unique()` compares by value as `uniqueItems` does. */
const PRIMITIVE_KINDS = new Set(["string", "number", "boolean", "literal", "oneOf", "format"]);

/** Whether a validator produces a primitive, seen through the wrappers that keep one. */
const producesPrimitive = (target: unknown, seen = new Set<unknown>()): boolean => {
  const record = describe(target as AnyValidator);
  if (record === undefined || seen.has(target)) {
    return false;
  }
  seen.add(target);
  switch (record.kind) {
    case "nullable":
    case "nullish":
    case "optional":
    case "readonly":
    case "meta":
      return producesPrimitive(record["inner"], seen);
    case "lazy": {
      // A getter that builds its schema anew makes a new validator at every level, so it is the getter
      // that comes back, and one already followed is taken as not.
      const getter = record["getter"] as () => unknown;
      if (seen.has(getter)) {
        return false;
      }
      seen.add(getter);
      return producesPrimitive(getter(), seen);
    }
    case "union":
      return (record["members"] as unknown[]).every((member) => producesPrimitive(member, seen));
    default:
      return PRIMITIVE_KINDS.has(record.kind);
  }
};

/**
 * Whether the items of the array a check is given are primitives. `unique()` compares an object by
 * identity, and `uniqueItems` by what it holds, so over objects the schema would refuse two equal ones
 * the check accepts. What cannot be told is taken as not.
 */
const holdsPrimitives = (record: Description, seen = new Set<unknown>()): boolean => {
  switch (record.kind) {
    case "array":
      return producesPrimitive(record["item"]);
    case "tuple":
      return [...(record["items"] as unknown[]), ...(record["rest"] === undefined ? [] : [record["rest"]])].every(
        (item) => producesPrimitive(item),
      );
    case "json":
    case "readonly":
    case "meta":
    case "lazy": {
      const inner = record.kind === "lazy" ? (record["getter"] as () => unknown)() : record["inner"];
      const described = describe(inner as AnyValidator);
      if (described === undefined || seen.has(inner)) {
        return false;
      }
      seen.add(inner);
      return holdsPrimitives(described, seen);
    }
    default:
      return false;
  }
};

/**
 * Writes a validator as a JSON Schema, draft 2020-12 unless `target` asks for draft-07, for whatever takes
 * one: the body of an HTTP API, the arguments of a tool a language model calls, a form generator.
 *
 * @remarks
 * The schema is read from what {@link describe} gives, so only validators made by this package's
 * factories can be written. It is written so that a value the validator accepts passes it, with the
 * exceptions below, and it accepts some the validator refuses, since a validator checks more than a
 * schema can say: a format's exact rules, such as which hosts of an `email` are public, are written as
 * the nearest JSON Schema `format`, and with none where that format refuses text the validator accepts,
 * as `time` refuses `12:00`. A format that reads Unicode and produces ASCII, such as `email`, is written
 * with no format on the input side and as `email` on the output side. A format JSON Schema has no name
 * for, such as `phone`, `slug` or one made with `format`, is written with none, since a reader in strict
 * mode, as Ajv is by default, refuses to compile a format it does not know.
 *
 * A schema reads a `pattern` in Unicode mode, the `u` flag, so one written without it is written as it is
 * when it means the same there, where `.` and a negated class match a whole character rather than half of
 * an emoji, and cannot be written otherwise, as `/^\@x$/`, which is an error in that mode, cannot.
 *
 * A step of `multipleOf` is written only when binary floating point holds it exactly, an integer or a
 * fraction such as `0.25`. A reader divides in binary, where `0.3 / 0.1` is not `3`, so a step such as
 * `0.1` or `0.01` is left out rather than written for a reader to refuse values the validator accepts.
 * `unique()` is written as `uniqueItems` only over items that are primitives, which both compare by value.
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
 * //     email: { type: "string" },
 * //     age: { type: "integer" },
 * //   },
 * //   required: ["name", "email"],
 * // }
 * ```
 *
 * @param validator - A validator made by a factory of this package.
 * @param options - Which side to write, and what to do with a part that cannot be written. `null` is no
 * options.
 * @returns The schema, as a new plain object.
 * @throws {TypeError} When a part cannot be written and `unrepresentable` is `"throw"`, naming the part
 * and its place, when an option is not one of its values, or when an option's name is not one of
 * {@link JsonSchemaOptions}.
 */
export function toJsonSchema(validator: AnyValidator, options?: JsonSchemaOptions): JsonSchema {
  assertFunction("validator", validator);
  // `null` is no options, as it is for a factory.
  const chosen: JsonSchemaOptions = options ?? {};
  if (!isPlainObject(chosen)) {
    throw new TypeError("options must be an object");
  }
  // A misspelled option, such as `draft` for `target`, would otherwise write the default without a word.
  const unknown = Object.keys(chosen).find((name) => !OPTION_NAMES.includes(name));
  if (unknown !== undefined) {
    throw new TypeError(`Unknown option ${unknown}`);
  }
  const { io = "input", unrepresentable = "throw", target = "draft-2020-12" } = chosen;
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
        const source = written.slice(1, end);
        const flags = written.slice(end + 1);
        // A flag such as `i` or `m` changes what the pattern accepts, and JSON Schema has no flags: it reads
        // every pattern in Unicode mode, `u`, which `v` reads a class otherwise than. `g` and `y` change
        // nothing: the check drops them.
        if (!/^g?u?y?$/.test(flags)) {
          refuse("a pattern with flags", path);
        } else if (flags.includes("u") || readsAlikeInUnicode(source)) {
          patterns.push(source);
        } else {
          refuse("a pattern Unicode mode reads otherwise", path);
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
        // A reader divides in binary, where 0.3 / 0.1 is not 3, so it would refuse a value the check
        // accepts. A step binary holds exactly divides as the check does; another is left out.
        if (isBinaryExact(value)) {
          schema["multipleOf"] = value;
        }
      } else if (format === "nonZero") {
        schema["not"] = { const: 0 };
      } else if (params["unique"] === true && by === undefined) {
        if (holdsPrimitives(record)) {
          schema["uniqueItems"] = true;
        }
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

  /**
   * `schema` with the keywords of `extra` beside it. Draft-07 ignores every keyword beside a `$ref`, so
   * there a reference is wrapped in an `allOf` first, and what is said of it is still read.
   */
  const beside = (schema: JsonSchema, extra: object): JsonSchema =>
    isDraft07 && schema["$ref"] !== undefined ? { allOf: [schema], ...extra } : { ...schema, ...extra };

  /** The schema of a part, with what `meta` says of it. */
  const convert = (target: unknown, path: string): JsonSchema => {
    const schema = write(target, path);
    const said = describe(target as AnyValidator)?.["meta"];
    return said === undefined ? schema : beside(schema, said as object);
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
        // A format made with `format` has a test no schema can hold, whatever its name.
        if (customFormats.has(given)) {
          return checked({ type: "string" });
        }
        const name = String(record["format"]);
        if (name === "port") {
          return checked({ type: "integer", minimum: 1, maximum: 65_535 });
        }
        if (name === "base64") {
          return checked({ type: "string", contentEncoding: given["url"] === true ? "base64url" : "base64" });
        }
        // Own names only, so a format made with `format("constructor", …)` is not taken for `Object`.
        const [input = "", output = input] = (Object.hasOwn(FORMAT_NAMES, name) && FORMAT_NAMES[name]) || [];
        // A local date-time has no offset, which `date-time` requires.
        const written =
          name === "ip" && given["version"] === "v4"
            ? "ipv4"
            : name === "datetime" && given["local"] === true
              ? ""
              : isInput
                ? input
                : output;
        return checked(written === "" ? { type: "string" } : { type: "string", format: written });
      }
      case "coerce": {
        const kind = describe(record["inner"] as AnyValidator)?.kind ?? "";
        const types = COERCED_TYPES[kind];
        if (!isInput || types === undefined) {
          return child("inner");
        }
        // A value given as the type a coercion produces passes only what its strict validator accepts.
        return kind === "bigint" || kind === "date"
          ? { type: [...types] }
          : { anyOf: [child("inner"), { type: types.length === 1 ? types[0] : [...types] }] };
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
        const unknownKeys = given["unknownKeys"];
        if (unknownKeys === "strict") {
          schema["additionalProperties"] = false;
        } else if (typeof unknownKeys === "function") {
          schema["additionalProperties"] = convert(unknownKeys, `${path}{}`);
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
            // Written as `{}`, the variant would match every value of another, which `oneOf` then refuses.
            return (
              refuse("a variant that is not an object", path) ?? {
                type: "object",
                properties: { [key]: { const: tag } },
                required: [key],
              }
            );
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
        return isInput && isJsonPrimitive(fallback) ? beside(child("inner"), { default: fallback }) : child("inner");
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
          // every level, and would be followed until the stack ran out. Its getter makes new `lazy` parts
          // each time it is called, which a long chain of distinct `lazy` parts built once does not.
          const target = getter();
          const isRebuilding = makesNewLazy(getter, target);
          if (isRebuilding && open >= MAX_OPEN_DEFINITIONS) {
            throw new TypeError(
              "toJsonSchema found a recursive schema that is built anew at every level. Build it once and refer to it",
            );
          }
          name = `schema${names.size + 1}`;
          names.set(getter, name);
          open += isRebuilding ? 1 : 0;
          try {
            definitions[name] = convert(target, path);
          } finally {
            open -= isRebuilding ? 1 : 0;
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
