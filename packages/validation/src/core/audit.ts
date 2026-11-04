import { customFormats, describe, type Description } from "./describe";
import { makesNewLazy } from "./lazy";
import { assertFunction } from "./result";
import type { AnyValidator } from "./types";

/** A place in a schema where input nobody controls is not bounded, as {@link audit} reports it. */
export interface AuditFinding {
  /**
   * What is missing. `"unbounded_size"`: an array, a set, a map or a record without a `max` or `length`,
   * a tuple with `rest` and no `max`, or a `file` without a `maxSize`. `"unbounded_text"`: text without a `max` or `length`, a format that
   * does not bound its own text, `json` or `searchParams` given text no step before them bounded, or a
   * `coerceBigint` without a bound on each side, `min` or `gt` and `max` or `lt`, which limit the digits it
   * converts.
   * `"raised_limit"`: a `lazy` whose `maxDepth` or `maxCalls` is above its default. `"unreadable"`: a
   * validator that has no description, such as one written by hand, so whether it bounds its input cannot
   * be told.
   */
  readonly rule: "unbounded_size" | "unbounded_text" | "raised_limit" | "unreadable";
  /**
   * Where the part is in the schema: property names joined by `.`, `[]` for the items of an array or a
   * set, `[0]` for an item of a tuple and `{}` for the keys and values of a record or a map, and `""` for
   * the validator itself.
   */
  readonly path: string;
  /** The kind of the part, as `describe` gives it, or `"unknown"` for a part that cannot be read. */
  readonly kind: string;
}

/** The formats whose input is bounded by what they accept, so they need no `max` of their own. */
const BOUNDED_FORMATS = new Set([
  "email",
  "uuid",
  "ulid",
  "cuid2",
  "nanoid",
  "ip",
  "cidr",
  "mac",
  "port",
  "phone",
  "creditCard",
  "isoDate",
  "hostname",
  "domain",
]);

const COLLECTIONS = new Set(["array", "set", "map", "record"]);

/** The defaults of `lazy`, above which a limit is reported as raised. */
const DEFAULT_LIMITS: Readonly<Record<string, number>> = { maxDepth: 128, maxCalls: 10_000 };

/**
 * How many `lazy` parts whose getter makes new `lazy` parts each time it is called may be walked at once,
 * one inside another, before a schema is taken to build itself anew.
 */
const MAX_OPEN_LAZY = 64;

const hasBound = (record: Description): boolean =>
  record.options?.["max"] !== undefined || record.options?.["length"] !== undefined;

/** Whether a format is a built-in one that bounds its text, and not one made with `format` under its name. */
const isBoundedFormat = (record: Description): boolean =>
  BOUNDED_FORMATS.has(String(record["format"])) && !customFormats.has(record.options as object);

/**
 * How much of a value a step before it bounds: nothing, the number of items of a collection, or all of it,
 * every item and every text it holds. A collection's `max` limits how many items it has, not what each
 * holds, so it bounds all of it only when its items are bounded too.
 */
const OPEN = 0;
const COUNT = 1;
const ALL = 2;
type Bound = typeof OPEN | typeof COUNT | typeof ALL;

/** The parts of a collection that hold its items. */
const ITEM_PARTS = ["item", "key", "value"];

/**
 * How much a part bounds what it produces, so a step after it in a `pipe` reads a value bounded that far:
 * all of it for a `string` with a bound or a format that bounds its input, the count for a collection with
 * a bound, all of it when its items are bounded too, the most of any step of a `pipe`, the least of the
 * options of a `union`, and what a wrapper holds, such as `optional`, `coerce` or another `pipe`.
 */
function boundOf(part: unknown): Bound {
  const record = describe(part as AnyValidator);
  if (record === undefined) {
    return OPEN;
  }
  const parts = (name: string): Bound[] => (record[name] as unknown[]).map(boundOf);
  switch (record.kind) {
    case "string":
      return hasBound(record) ? ALL : OPEN;
    case "format":
      return isBoundedFormat(record) ? ALL : OPEN;
    case "pipe":
      return Math.max(OPEN, ...parts("steps")) as Bound;
    case "union":
      return Math.min(ALL, ...parts("members")) as Bound;
    case "codec":
      // What it produces is decoded from what its input read.
      return Math.max(boundOf(record["input"]), boundOf(record["output"])) as Bound;
    case "lazy":
      return OPEN;
    default:
      if (COLLECTIONS.has(record.kind)) {
        if (!hasBound(record)) {
          return OPEN;
        }
        return ITEM_PARTS.every((name) => record[name] === undefined || boundOf(record[name]) === ALL) ? ALL : COUNT;
      }
      return record["inner"] === undefined ? OPEN : boundOf(record["inner"]);
  }
}

/**
 * Finds where a schema accepts input of a size nothing bounds, so a test can hold a schema for input
 * nobody controls to the bounds it needs.
 *
 * @remarks
 * Input that passes a validator is validated in full, so a body of a million items, or of text a gigabyte
 * long, costs what its size costs. Each array, set, map, record and text needs a `max` or a `length`, and
 * a tuple with `rest` a `max`, and a `file` a `maxSize`, unless something before it bounds it: text read by `json` or `searchParams`
 * inside `pipe(string({ max }), ...)`, and everything inside it, is bounded by that `max`. A collection's
 * `max` bounds how many items a collection after it has, not what they hold. A tuple without
 * `rest` has its length already. Formats whose input is bounded by what they accept, such as `email`,
 * `uuid` and `ip`, need none; others, such as `url`, `hex` and `jwt`, are text like any other, and so is one
 * made with `format`, whatever its name.
 *
 * Text read by `coerceBigint` needs a bound on each side, since converting it takes longer than linear
 * time in its length, and a bound limits the digits converted.
 *
 * It reads the schema and never calls it, though it calls the getter of each `lazy` twice, to tell a schema
 * built anew at every level from one built once. Whether a `max` is small enough is not its to judge: any number
 * says someone decided. A check is not read, since it runs on a value that already passed. It lists the
 * bounds an option can set, so it does not report the keys an `object` with `unknownKeys: "passthrough"`
 * keeps, nor what `unknown()` accepts: neither has an option that bounds it. Use `"strip"` or `"strict"`
 * for keys the schema does not name, and a validator of the type you expect in place of `unknown()`.
 *
 * @example
 * ```ts
 * const signup = object({ name: string({ max: 100 }), tags: array(string({ max: 20 })) });
 * audit(signup); // [{ rule: "unbounded_size", path: "tags", kind: "array" }]
 *
 * // In a test, of the schema with every bound it needs:
 * const bounded = object({ name: string({ max: 100 }), tags: array(string({ max: 20 }), { max: 10 }) });
 * expect(audit(bounded)).toEqual([]);
 * ```
 *
 * @param validator - Any validator.
 * @returns Every place a bound is missing, in the order the schema lists them; empty when there is none.
 * @throws {TypeError} When `validator` is not a function, or when a recursive schema is built anew at every
 * level, as `lazy(() => build())` builds it, so that its parts never repeat: build it once and refer to it.
 */
export function audit(validator: AnyValidator): readonly AuditFinding[] {
  assertFunction("validator", validator);
  const findings: AuditFinding[] = [];
  // The getters of the `lazy` parts being walked, so a recursive schema ends where it refers to itself,
  // and the same `lazy` at two places is walked at each, where its context may differ.
  const walking = new Set<unknown>();
  // The getters reported for raised limits, so a `lazy` used at two places is reported once.
  const reported = new Set<unknown>();
  // How many of the `lazy` parts being walked make new `lazy` parts each time their getter is called.
  let rebuilding = 0;
  const at = (path: string, key: string): string => (path === "" ? key : `${path}.${key}`);

  // `bounded` is how much of the value a step before it bounds, as `boundOf` gives it.
  const walk = (target: unknown, path: string, bounded: Bound): void => {
    const record = describe(target as AnyValidator);
    if (record === undefined) {
      findings.push({ rule: "unreadable", path, kind: "unknown" });
      return;
    }
    const report = (rule: AuditFinding["rule"]): void => {
      findings.push({ rule, path, kind: record.kind });
    };
    // What the value holds is bounded only by a bound on all of it; one on its count bounds no item.
    const held = bounded === ALL ? ALL : OPEN;
    const inner = (name = "inner", place = path, bound = bounded): void => {
      if (record[name] !== undefined) {
        walk(record[name], place, bound);
      }
    };
    const each = (name: string, place: (index: number) => string = () => path, bound = bounded): void => {
      (record[name] as unknown[]).forEach((part, index) => walk(part, place(index), bound));
    };

    switch (record.kind) {
      case "string":
        if (bounded !== ALL && !hasBound(record)) {
          report("unbounded_text");
        }
        return;
      case "format":
        if (bounded !== ALL && !isBoundedFormat(record)) {
          report("unbounded_text");
        }
        return;
      case "file":
        // A file is held by whoever read the form, whatever bounded the text around it.
        if (record.options?.["maxSize"] === undefined) {
          report("unbounded_size");
        }
        return;
      case "array":
      case "set":
        if (bounded === OPEN && !hasBound(record)) {
          report("unbounded_size");
        }
        inner("item", `${path}[]`, held);
        return;
      case "map":
      case "record":
        if (bounded === OPEN && !hasBound(record)) {
          report("unbounded_size");
        }
        inner("key", `${path}{}`, held);
        inner("value", `${path}{}`, held);
        return;
      case "tuple":
        if (bounded === OPEN && record["rest"] !== undefined && record.options?.["max"] === undefined) {
          report("unbounded_size");
        }
        each("items", (index) => `${path}[${index}]`, held);
        inner("rest", `${path}[]`, held);
        return;
      case "object":
      case "objectLike":
        for (const [key, part] of Object.entries(record["shape"] as Record<string, unknown>)) {
          walk(part, at(path, key), held);
        }
        return;
      case "tagged":
        for (const variant of Object.values(record["variants"] as Record<string, unknown>)) {
          walk(variant, path, bounded);
        }
        return;
      case "union":
      case "intersection":
        each("members");
        return;
      case "pipe": {
        // A step reads what the steps before it produced, so one that bounds its value bounds the rest.
        let bound = bounded;
        for (const step of record["steps"] as unknown[]) {
          walk(step, path, bound);
          bound = Math.max(bound, boundOf(step)) as Bound;
        }
        return;
      }
      case "codec":
        // What is sent is what the input reads; the output reads what the program made of it.
        inner("input");
        return;
      case "coerce": {
        // Text read as a bigint takes longer than linear time to convert, unless a bound on each side
        // limits its digits.
        const strict = describe(record["inner"] as AnyValidator);
        const isOpen = (low: string, high: string): boolean =>
          strict?.options?.[low] === undefined && strict?.options?.[high] === undefined;
        if (bounded !== ALL && strict?.kind === "bigint" && (isOpen("min", "gt") || isOpen("max", "lt"))) {
          report("unbounded_text");
        }
        inner();
        return;
      }
      case "json":
      case "searchParams":
        if (bounded !== ALL) {
          report("unbounded_text");
        }
        inner("inner", path, held);
        return;
      case "lazy": {
        const getter = record["getter"] as () => unknown;
        if (
          !reported.has(getter) &&
          Object.entries(DEFAULT_LIMITS).some(([name, limit]) => Number(record.options?.[name] ?? limit) > limit)
        ) {
          reported.add(getter);
          report("raised_limit");
        }
        if (!walking.has(getter)) {
          // A getter written where the schema is built, as in `lazy(() => build())`, is a new function at
          // every level, and would be followed until the stack ran out. Its getter makes new `lazy` parts
          // each time it is called, which a long chain of distinct `lazy` parts built once does not.
          const target = getter();
          const isRebuilding = makesNewLazy(getter, target);
          if (isRebuilding && rebuilding >= MAX_OPEN_LAZY) {
            throw new TypeError(
              "audit found a recursive schema that is built anew at every level. Build it once and refer to it",
            );
          }
          rebuilding += isRebuilding ? 1 : 0;
          walking.add(getter);
          walk(target, path, bounded);
          walking.delete(getter);
          rebuilding -= isRebuilding ? 1 : 0;
        }
        return;
      }
      default:
        // A wrapper, such as `optional`, `coerce`, `transform` or `meta`, is as bounded as what it holds;
        // a leaf, such as `number` or `guard`, holds nothing whose size the input sets.
        inner();
    }
  };

  walk(validator, "", OPEN);
  return Object.freeze(findings);
}
