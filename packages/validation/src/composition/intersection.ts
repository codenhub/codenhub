import { runOf, toolsOf } from "../core/child";
import { describe, type Description } from "../core/describe";
import { accepter, waitsOf } from "../core/finish";
import { resolvedOf } from "../core/lazy";
import { toValidator } from "../core/make";
import { entriesOf, isArray, isPlainObject, setOwn, sizeOfMap, sizeOfSet, timeOf, valuesOf } from "../core/objects";
import { issue, RESERVED_KEY, reservedKey } from "../core/result";
import { adopt, cap, count, FAIL, MAX_ISSUES, type Pending as Waiting, type Run } from "../core/run";
import { split } from "../core/split";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
  ValidationIssue,
  ValidationPathSegment,
} from "../core/types";
import { wordKey, wordSize } from "../core/words";

/** A pair of values still to be merged, where the result goes, and how it was reached. */
interface Pending {
  left: unknown;
  right: unknown;
  place: (merged: unknown) => void;
  parent?: Pending;
  segment?: ValidationPathSegment;
  /** Whether the pair is the key of a map entry, whose path is the entry's, as its value's is. */
  isKey?: boolean;
}

/** A step of the walk: a pair to merge, or work to finish once every pair queued before it is merged. */
type Step = Pending | (() => void);

/** What each pair of objects already met was merged into, so a pair met again is not walked again. */
type Merged = Map<object, Map<object, unknown>>;

/** What every pair of one merge shares. */
interface Walk {
  /** The two validators whose outputs are merged. */
  members: readonly [AnyValidator, AnyValidator];
  conflicts: ValidationIssue[];
  merged: Merged;
}

/** The path from the root to a pair, built only when a conflict is reported there. */
function pathOf(pending: Pending): ValidationPathSegment[] {
  const path: ValidationPathSegment[] = [];
  for (let node: Pending | undefined = pending; node?.segment !== undefined; node = node.parent) {
    path.push(node.segment);
  }
  return path.reverse();
}

/**
 * Reports the place two outputs conflict, up to one past the limit of a collection, which is how the list
 * is known to be cut: every item of two long lists may conflict, and only the first thousand are reported.
 */
function conflict(conflicts: ValidationIssue[], pending: Pending): void {
  if (conflicts.length <= MAX_ISSUES) {
    conflicts.push(issue("invalid_intersection", undefined, pathOf(pending)));
  }
}

/** Reports an own `__proto__` no shape listed in the object the merge builds at `pending`, as `conflict` reports. */
function reserved(conflicts: ValidationIssue[], pending: Pending): void {
  if (conflicts.length <= MAX_ISSUES) {
    const found = reservedKey(RESERVED_KEY);
    conflicts.push({ ...found, path: [...pathOf(pending), ...found.path] });
  }
}

/** A segment of the path to a pair, and whether it leads to the key of a map entry. */
interface Place {
  segment: ValidationPathSegment;
  isKey: boolean;
}

/** The places from the root to a pair, built only when a reserved key is met there. */
function placesOf(pending: Pending): Place[] {
  const places: Place[] = [];
  for (let node: Pending | undefined = pending; node?.segment !== undefined; node = node.parent) {
    places.push({ segment: node.segment, isKey: node.isKey === true });
  }
  return places.reverse();
}

/** The kinds that give back the value they were given, so what they produce is what the step before made. */
const PASSING_KINDS = new Set(["unknown", "guard", "instance"]);

/**
 * The validators that produce the value of `validator`'s output itself, such as the members of a union. Of
 * a `pipe` that is the last step, and the step before each that gives back what it was given. A
 * `transform` makes its own value, which no shape describes, and a `lazy` produces what its getter
 * returned, read as it was kept, so the getter is not called again; one never called produced nothing.
 */
function producersOf(validator: unknown, record: Description): readonly unknown[] | undefined {
  switch (record.kind) {
    case "union":
    case "intersection":
      return record["members"] as unknown[];
    case "tagged":
      return Object.values(record["variants"] as Record<string, unknown>);
    case "pipe": {
      const steps = record["steps"] as unknown[];
      let first = steps.length - 1;
      while (first > 0 && PASSING_KINDS.has(describe(steps[first] as AnyValidator)?.kind ?? "")) {
        first -= 1;
      }
      return steps.slice(first);
    }
    case "codec":
      return [record["output"]];
    case "transform":
      return [];
    case "lazy": {
      const resolved = resolvedOf(validator);
      return resolved === undefined ? [] : [resolved];
    }
    default:
      return record["inner"] === undefined ? undefined : [record["inner"]];
  }
}

/** The validators that produce what is at `place` of `record`'s output. */
function partsAt(record: Description, { segment, isKey }: Place): readonly unknown[] {
  switch (record.kind) {
    case "object":
    case "objectLike": {
      const shape = record["shape"] as Record<string, unknown>;
      const rest = record["unknownKeys"];
      return typeof segment === "string" && Object.hasOwn(shape, segment)
        ? [shape[segment]]
        : typeof rest === "function"
          ? [rest]
          : [];
    }
    case "array":
    case "set":
      return [record["item"]];
    case "tuple": {
      const items = record["items"] as unknown[];
      return typeof segment === "number" && segment < items.length ? [items[segment]] : [record["rest"]];
    }
    case "record":
      return [record["value"]];
    case "map":
      return [isKey ? record["key"] : record["value"]];
    default:
      return [];
  }
}

/**
 * Whether a shape that `validator` reaches at `path` lists `__proto__`, so the developer named the key.
 * Where more than one part may have produced the value, as in a union, any of them listing it is enough,
 * which keeps what such a shape gave before. `seen` stops a `lazy` that returns itself at the same level.
 */
function listsReserved(validator: unknown, path: readonly Place[], seen = new Set<unknown>()): boolean {
  const record = typeof validator === "function" ? describe(validator as AnyValidator) : undefined;
  if (record === undefined || seen.has(validator)) {
    return false;
  }
  seen.add(validator);
  const producers = producersOf(validator, record);
  if (producers !== undefined) {
    return producers.some((each) => listsReserved(each, path, seen));
  }
  const [place, ...rest] = path;
  if (place === undefined) {
    return (
      (record.kind === "object" || record.kind === "objectLike") &&
      Object.hasOwn(record["shape"] as object, RESERVED_KEY)
    );
  }
  return partsAt(record, place).some((each) => listsReserved(each, rest));
}

/**
 * Gives back `output`, the object a pair was merged into, having reported an own `__proto__` in it that no
 * shape lists at `pending`. The object is new, so the key, which an unchecked side passed on, would
 * become the prototype of any copy of it made by assignment.
 */
function checkReserved(output: unknown, pending: Pending, walk: Walk): unknown {
  if (
    isPlainObject(output) &&
    Object.hasOwn(output, RESERVED_KEY) &&
    !walk.members.some((each) => listsReserved(each, placesOf(pending)))
  ) {
    reserved(walk.conflicts, pending);
  }
  return output;
}

/**
 * Merges one pair, queueing the pairs inside it in `inner`. The same value on both sides is kept,
 * which is what a key both sides passed through unchecked holds, and so are two dates holding the same
 * moment. A pair of objects met before, as a cycle or a shared reference in the outputs meets it, gives
 * what it was merged into the first time, so the output keeps that shape and the walk ends. Plain
 * objects are merged key by key and arrays of the same length item by item. Maps and sets of the same
 * size are merged entry by entry in iteration order: both validators read the same input in the same
 * order, so the entries at one position come from the same input entry. Their contents are filled in by
 * a last step queued after the pairs inside them. Anything else cannot be both values at once, so it is
 * reported in `conflicts` at its path, and the right value stands in only so the walk can go on.
 */
function mergeOne(pending: Pending, inner: Step[], walk: Walk): unknown {
  const { left, right } = pending;
  const { conflicts, merged } = walk;
  if (Object.is(left, right)) {
    return right;
  }
  // The one pair `===` holds for and Object.is does not is 0 and -0, the same number, merged as 0.
  if (left === right) {
    return 0;
  }
  // Two values that differ and are not both objects can be nothing but a conflict.
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    conflict(conflicts, pending);
    return right;
  }
  if (merged.get(left)?.has(right) === true) {
    // What a pair was merged into before is checked again here, since a shape may list a `__proto__` at
    // the place it was first met and not at this one.
    return checkReserved(merged.get(left)?.get(right), pending, walk);
  }
  const remember = <T>(output: T): T => {
    const byRight = merged.get(left) ?? new Map<object, unknown>();
    byRight.set(right, output);
    merged.set(left, byRight);
    return output;
  };
  const queue = (pair: Omit<Pending, "parent">): void => {
    inner.push({ ...pair, parent: pending });
  };

  // `isArray` and not `Array.isArray`, which throws for a revoked proxy one side passed through as it is.
  if (isArray(left) && isArray(right) && left.length === right.length) {
    const output = remember<unknown[]>(Array.from({ length: left.length }));
    for (let index = 0; index < left.length; index += 1) {
      const place = (value: unknown): void => {
        output[index] = value;
      };
      queue({ left: left[index], right: right[index], place, segment: index });
    }
    return output;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const output = remember<Record<string, unknown>>({});
    // setOwn defines an own data property, so no key can write to the prototype.
    for (const [key, value] of Object.entries(left)) {
      setOwn(output, key, value);
    }
    for (const [key, value] of Object.entries(right)) {
      if (Object.hasOwn(output, key)) {
        const place = (both: unknown): void => setOwn(output, key, both);
        queue({ left: output[key], right: value, place, segment: key });
      } else {
        setOwn(output, key, value);
      }
    }
    return checkReserved(output, pending, walk);
  }
  // Asked only now: asking whether a value is a Date, a Map or a Set throws and catches inside for a value
  // that is not, which for every array or plain object cost ten times the validation itself.
  const time = timeOf(left);
  if (time !== undefined && time === timeOf(right)) {
    return right;
  }
  const mapSize = sizeOfMap(left);
  if (mapSize !== undefined && mapSize === sizeOfMap(right)) {
    const output = remember(new Map<unknown, unknown>());
    const rightEntries = entriesOf(right);
    const keys: unknown[] = [];
    const values: unknown[] = [];
    entriesOf(left).forEach(([leftKey, leftValue], index) => {
      const [rightKey, rightValue] = rightEntries[index] as [unknown, unknown];
      // A string key names its entry, as it does in `map`; any other key is named by its position.
      const segment = typeof leftKey === "string" && leftKey === rightKey ? leftKey : index;
      const placeKey = (key: unknown): void => {
        keys[index] = key;
      };
      const placeValue = (value: unknown): void => {
        values[index] = value;
      };
      queue({ left: leftKey, right: rightKey, place: placeKey, segment, isKey: true });
      queue({ left: leftValue, right: rightValue, place: placeValue, segment });
    });
    inner.push(() => keys.forEach((key, index) => output.set(key, values[index])));
    return output;
  }
  const setSize = sizeOfSet(left);
  if (setSize !== undefined && setSize === sizeOfSet(right)) {
    const output = remember(new Set<unknown>());
    const rightValues = valuesOf(right);
    const values: unknown[] = [];
    valuesOf(left).forEach((leftValue, index) => {
      const place = (value: unknown): void => {
        values[index] = value;
      };
      queue({ left: leftValue, right: rightValues[index], place, segment: index });
    });
    inner.push(() => values.forEach((value) => output.add(value)));
    return output;
  }
  conflict(conflicts, pending);
  return right;
}

/**
 * Combines two validated values into one, depth first, reporting every place they conflict. It walks
 * with a list of its own rather than by recursion, so outputs nested deeper than the stack allows,
 * such as two parses of the same JSON, are merged instead of overflowing it.
 */
function merge(left: unknown, right: unknown, walk: Walk): unknown {
  let result: unknown;
  const steps: Step[] = [
    {
      left,
      right,
      place: (value) => {
        result = value;
      },
    },
  ];
  for (let next = steps.pop(); next !== undefined; next = steps.pop()) {
    if (typeof next === "function") {
      next();
      continue;
    }
    const inner: Step[] = [];
    next.place(mergeOne(next, inner, walk));
    // Pushed last first, so they are taken in order and conflicts keep the order of the keys. The step
    // that fills a map or a set is queued last, so it runs once every pair inside it is merged.
    for (let index = inner.length - 1; index >= 0; index -= 1) {
      steps.push(inner[index] as Step);
    }
  }
  return result;
}

/**
 * Creates a validator that accepts a value only when it passes both validators, and produces the two
 * results merged.
 *
 * @remarks
 * Both validators receive the same input and both run, so the issues of each are reported together.
 * The outputs are merged: plain objects key by key, arrays of the same length item by item, and maps
 * and sets of the same size entry by entry in iteration order, which both validators keep from the
 * input, recursively, so maps keyed by objects and sets of objects merge too. Any other pair must be the
 * same value, `0` and `-0` merging as `0`, or two dates holding the same moment. Where the outputs differ otherwise, such as
 * `"  ab "` trimmed on one side and uppercased on the other, no value satisfies both, so each such place
 * fails with `invalid_intersection` at its path, rather than one side silently winning, up to the 1,000 issues a collection reports. Cyclic or
 * shared objects in the outputs are merged once, and the merged output keeps their shape. The merged
 * object is new, so an own `__proto__` key that a side passed on unchecked, as `unknown()` does, is
 * reported as `invalid_key` with `{ reserved: true }`, as `record` reports it, unless a shape of either
 * side that made the value there lists `__proto__`: not one a `transform` runs before its function, one
 * in a `pipe` step followed by a step that makes a new object, or a `map` entry's key validator, for
 * the entry's value. A value both sides passed on whole is the input's own object, and is
 * kept as it is. Two `object`s
 * made by `strictObject` pass together only when every key of the input is listed in both shapes,
 * since each rejects the keys only the other lists; spread their shapes into one strict object instead. It is synchronous when both validators are, and
 * asynchronous otherwise.
 *
 * @example
 * ```ts
 * const named = object({ name: string() });
 * const aged = object({ age: number() });
 * intersection(named, aged)({ name: "Ada", age: 36 }); // { ok: true, value: { name: "Ada", age: 36 } }
 * ```
 *
 * @typeParam TLeft - The first validator.
 * @typeParam TRight - The second validator.
 * @param left - The first validator.
 * @param right - The second validator.
 * @returns A validator that produces the merged outputs, typed as an intersection.
 * @throws {TypeError} When `left` or `right` is not a function.
 */
export function intersection<TLeft extends AnyValidator, TRight extends AnyValidator>(
  left: TLeft,
  right: TRight,
  ...rest: Rest<Infer<TLeft> & Infer<TRight>, MessageOptions>
): Composed<TLeft | TRight, Infer<TLeft> & Infer<TRight>, InferInput<TLeft> & InferInput<TRight>>;
export function intersection<TLeft extends AnyValidator, TRight extends AnyValidator>(
  left: TLeft,
  right: TRight,
  ...rest: AsyncRest<Infer<TLeft> & Infer<TRight>, MessageOptions>
): AsyncSchema<Infer<TLeft> & Infer<TRight>, InferInput<TLeft> & InferInput<TRight>>;
export function intersection(left: AnyValidator, right: AnyValidator, ...rest: unknown[]): AnyValidator {
  const runLeft = runOf(left, "left");
  const runRight = runOf(right, "right");
  const [options, checks] = split<MessageOptions, unknown>(rest);
  const { message } = options;
  const accept = accepter(checks, message);
  const tools = toolsOf([runLeft, runRight], waitsOf(checks));
  // `from` is where the issues of this intersection begin: a member that failed left some there.
  const finish = (first: unknown, second: unknown, from: number): unknown => {
    if (count() > from) {
      return FAIL;
    }
    const conflicts: ValidationIssue[] = [];
    const merged = merge(first, second, { members: [left, right], conflicts, merged: new Map() });
    if (conflicts.length === 0) {
      return accept(merged);
    }
    adopt(conflicts, message);
    return cap(from, message);
  };
  const run: Run = (input) => {
    const start = count();
    // Both run, whatever the first found, so one run reports what each of them refuses.
    const first = runLeft(input);
    const mark = count() - start;
    const second = runRight(input);
    if (tools === undefined || !(tools.is(first) || tools.is(second))) {
      return finish(first, second, start);
    }
    const waited: Waiting[] = [];
    const marks: number[] = [];
    if (tools.is(first)) {
      waited.push(first);
      marks.push(0);
    }
    if (tools.is(second)) {
      waited.push(second);
      marks.push(mark);
    }
    return tools.join(start, waited, [], marks, (settled) =>
      finish(tools.is(first) ? settled[0] : first, tools.is(second) ? settled.at(-1) : second, 0),
    );
  };
  run.w = tools;
  return toValidator(
    run,
    { kind: "intersection", options, checks, members: Object.freeze([left, right]) },
    [wordKey, wordSize],
    [left, right],
  );
}
