import { describe, type Description } from "./describe";
import { assertFunction } from "./result";
import type { AnyValidator } from "./types";

/** A place in a schema where input nobody controls is not bounded, as {@link audit} reports it. */
export interface AuditFinding {
  /**
   * What is missing. `"unbounded_size"`: an array, a set, a map or a record without a `max` or `length`,
   * or a tuple with `rest` and no `max`. `"unbounded_text"`: text without a `max` or `length`, a format that
   * does not bound its own text, or `json` or `searchParams` given text no step before them bounded.
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

const hasBound = (record: Description): boolean =>
  record.options?.["max"] !== undefined || record.options?.["length"] !== undefined;

/**
 * Whether a part bounds what it produces, so a step after it in a `pipe` reads a bounded value: a
 * `string` or a collection with a bound, a format that bounds its input, a `pipe` with such a step, a
 * `union` whose every option is one, and a wrapper of one, such as `optional`, `coerce` or another `pipe`.
 */
function boundsItself(record: Description | undefined): boolean {
  if (record === undefined) {
    return false;
  }
  const parts = (name: string): Description[] =>
    (record[name] as AnyValidator[]).map((part) => describe(part) as Description);
  switch (record.kind) {
    case "string":
      return hasBound(record);
    case "format":
      return BOUNDED_FORMATS.has(String(record["format"]));
    case "pipe":
      return parts("steps").some(boundsItself);
    case "union":
      return parts("members").every(boundsItself);
    case "lazy":
      return false;
    default:
      return COLLECTIONS.has(record.kind)
        ? hasBound(record)
        : record["inner"] !== undefined && boundsItself(describe(record["inner"] as AnyValidator));
  }
}

/**
 * Finds where a schema accepts input of a size nothing bounds, so a test can hold a schema for input
 * nobody controls to the bounds it needs.
 *
 * @remarks
 * Input that passes a validator is validated in full, so a body of a million items, or of text a gigabyte
 * long, costs what its size costs. Each array, set, map, record and text needs a `max` or a `length`, and
 * a tuple with `rest` a `max`, unless something before it bounds it: text read by `json` or `searchParams`
 * inside `pipe(string({ max }), ...)`, and everything inside it, is bounded by that `max`. A tuple without
 * `rest` has its length already. Formats whose input is bounded by what they accept, such as `email`,
 * `uuid` and `ip`, need none; others, such as `url`, `hex` and `jwt`, are text like any other.
 *
 * It reads the schema and never calls it. Whether a `max` is small enough is not its to judge: any number
 * says someone decided. A check is not read, since it runs on a value that already passed.
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
 * @throws {TypeError} When `validator` is not a function.
 */
export function audit(validator: AnyValidator): readonly AuditFinding[] {
  assertFunction("validator", validator);
  const findings: AuditFinding[] = [];
  // The getters of the `lazy` parts being walked, so a recursive schema ends where it refers to itself,
  // and the same `lazy` at two places is walked at each, where its context may differ.
  const walking = new Set<unknown>();
  // The getters reported for raised limits, so a `lazy` used at two places is reported once.
  const reported = new Set<unknown>();
  const at = (path: string, key: string): string => (path === "" ? key : `${path}.${key}`);

  const walk = (target: unknown, path: string, bounded: boolean): void => {
    const record = describe(target as AnyValidator);
    if (record === undefined) {
      findings.push({ rule: "unreadable", path, kind: "unknown" });
      return;
    }
    const report = (rule: AuditFinding["rule"]): void => {
      findings.push({ rule, path, kind: record.kind });
    };
    const inner = (name = "inner", place = path, isBounded = bounded): void => {
      if (record[name] !== undefined) {
        walk(record[name], place, isBounded);
      }
    };
    const each = (name: string, place: (index: number) => string = () => path): void => {
      (record[name] as unknown[]).forEach((part, index) => walk(part, place(index), bounded));
    };

    switch (record.kind) {
      case "string":
        if (!bounded && !hasBound(record)) {
          report("unbounded_text");
        }
        return;
      case "format":
        if (!bounded && !BOUNDED_FORMATS.has(String(record["format"]))) {
          report("unbounded_text");
        }
        return;
      case "array":
      case "set":
        if (!bounded && !hasBound(record)) {
          report("unbounded_size");
        }
        inner("item", `${path}[]`);
        return;
      case "map":
      case "record":
        if (!bounded && !hasBound(record)) {
          report("unbounded_size");
        }
        inner("key", `${path}{}`);
        inner("value", `${path}{}`);
        return;
      case "tuple":
        if (!bounded && record["rest"] !== undefined && record.options?.["max"] === undefined) {
          report("unbounded_size");
        }
        each("items", (index) => `${path}[${index}]`);
        inner("rest", `${path}[]`);
        return;
      case "object":
      case "objectLike":
        for (const [key, part] of Object.entries(record["shape"] as Record<string, unknown>)) {
          walk(part, at(path, key), bounded);
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
        let isBounded = bounded;
        for (const step of record["steps"] as unknown[]) {
          walk(step, path, isBounded);
          isBounded ||= boundsItself(describe(step as AnyValidator));
        }
        return;
      }
      case "json":
      case "searchParams":
        if (!bounded) {
          report("unbounded_text");
        }
        inner();
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
          walking.add(getter);
          walk(getter(), path, bounded);
          walking.delete(getter);
        }
        return;
      }
      default:
        // A wrapper, such as `optional`, `coerce`, `transform` or `meta`, is as bounded as what it holds;
        // a leaf, such as `number` or `guard`, holds nothing whose size the input sets.
        inner();
    }
  };

  walk(validator, "", false);
  return Object.freeze(findings);
}
