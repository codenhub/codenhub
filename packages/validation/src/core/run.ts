/*
 * The single pass. A validator is `(input) => result`, and that call is all a consumer sees. Inside the
 * package a validator is reached through its run, which returns the value it produced, or `FAIL` once it
 * has reported why into the list of the validation running now. So input that passes makes nothing but its
 * output, and a validator has one implementation, whether its input passes or not.
 *
 * A path is written from the value outwards while a validation runs: a validator reports at its own value,
 * and a composer adds the key of a child only once that child failed. The paths are turned round once, when
 * the result is made.
 *
 * It also tracks a validation: a call such as `schema(input)` and everything it reaches, the continuations
 * after its awaits included. Each `lazy` counts its calls per validation against its own limit.
 */
import { assertText, describeType, type IssueInput } from "./result";
import type {
  Message,
  ValidationErr,
  ValidationFailure,
  ValidationIssue,
  ValidationOk,
  ValidationPathSegment,
  ValidationResult,
} from "./types";

/** What a run returns for a value it refuses, once it has reported why. */
export const FAIL: unique symbol = /* @__PURE__ */ Symbol("fail");

/**
 * The key a validator keeps its run under, and the one a check keeps what runs it under. Each is a symbol
 * of this copy of the package and not a text any copy reads: a run reports into the issue list of the
 * copy that made it and answers with its {@link FAIL}, so a composer of another copy would find no issue
 * and take the failure for a value. Kept so, what another copy made carries nothing under these keys and
 * is refused where it is given, as a function written by hand is.
 */
export const RUN: unique symbol = /* @__PURE__ */ Symbol("run");
export const CHECK: unique symbol = /* @__PURE__ */ Symbol("check");

/** The type of {@link FAIL}. */
export type Fail = typeof FAIL;

/** How many issues the items of one collection report before it stops. */
export const MAX_ISSUES = 1000;

/** An issue of a validation that is running: its path is its own list, written from the value outwards. */
export type Draft = { -readonly [K in keyof ValidationIssue]: ValidationIssue[K] } & {
  path: ValidationPathSegment[];
};

/**
 * The helpers for a result that is not ready, which only something that may wait brings to the validator
 * given it. A validator that can never wait has none, and so carries none of their code.
 */
export interface Tools {
  /** Tests whether what a run returned is a result that is not ready. */
  is(this: void, value: unknown): value is Pending;
  /**
   * Gives the result `next` returns for what `promise` resolves to, within the validation running now.
   * The issues reported since `mark` wait with it, and are reported again before `next` runs.
   */
  wait(this: void, mark: number, promise: PromiseLike<unknown>, next: (resolved: never) => unknown): Pending;
  /**
   * Gives the result `next` returns for what a pending run produces, once its issues are reported. `next`
   * is also given where the issues reported since `mark` begin, which is the start of a list of its own.
   */
  after(this: void, mark: number, pending: Pending, next: (value: unknown, from: number) => unknown): Pending;
  /**
   * Waits for the pending children of a composer, whose issues began at `start`. `marks[index]` is how many
   * of those were reported when child `index` was found pending, so its issues are placed, under
   * `keys[index]`, where those of the children before it end. `next` is given what each child produced.
   */
  join(
    this: void,
    start: number,
    pendings: readonly Pending[],
    keys: readonly (ValidationPathSegment | undefined)[],
    marks: readonly number[],
    next: (values: unknown[]) => unknown,
  ): Pending;
  /** The public result of a validator whose run waits. */
  settle(this: void, pending: Pending): Promise<ValidationResult<unknown>>;
}

/**
 * A result that is not ready: `p` resolves to what the run produced and every issue it reported. A run
 * that returns one leaves none of its issues in the list, so whoever waits places them all at once.
 */
export interface Pending {
  readonly p: Promise<readonly [value: unknown, issues: Draft[] | undefined]>;
}

/**
 * The run of a validator: the value it produced, {@link FAIL}, or a result that is not ready. `w` is set
 * on a run that may return one that is not ready, and holds the helpers to wait for it.
 */
export type Run = ((input: unknown) => unknown) & { w?: Tools | undefined };

/** The issues of the validation running now, made by the first one reported. */
let issues: Draft[] | undefined;

/** How many issues the validation running now has reported. */
export const count = (): number => (issues === undefined ? 0 : issues.length);

/**
 * Gives an issue the wording of the validator reporting it. A message function is given a copy, since the
 * path of the issue itself is still being written.
 */
function say(found: Draft, message: Message): void {
  if (typeof message === "function") {
    const text: unknown = message({ ...found, path: [...found.path] });
    // A function that returns anything but text, such as a translation lookup that missed, would put it
    // in the issue, and a form would show `undefined` or `[object Object]`.
    assertText("message", text);
    found.message = text as string;
  } else {
    found.message = message;
  }
}

/**
 * Reports an issue at the value being validated, or at `key` of it, worded by `message` when there is
 * one, and returns {@link FAIL}.
 */
export function report(
  code: ValidationIssue["code"],
  params: Readonly<Record<string, unknown>> | undefined,
  message: Message | undefined,
  key?: ValidationPathSegment,
): Fail {
  const path: ValidationPathSegment[] = key === undefined ? [] : [key];
  const found: Draft = params === undefined ? { code, path } : { code, path, params };
  if (message !== undefined) {
    say(found, message);
  }
  // Made holding its first issue: an empty list grows to sixteen places for the one most failures report.
  if (issues === undefined) {
    issues = [found];
  } else {
    issues.push(found);
  }
  return FAIL;
}

/** Reports that the input is not of the `expected` type, naming the type it has and never its value. */
export const refuse = (expected: string, input: unknown, message: Message | undefined): Fail =>
  report("invalid_type", { expected, received: describeType(input) }, message);

/**
 * Takes in issues written elsewhere with their paths from the value: a check's, a validator's written by
 * hand, or a list a helper built. Each is copied, so a list its maker reuses is never changed, and worded
 * by `message` when it has no wording of its own. One without a path is at the value, and without a code
 * is `"custom"`, as `fail()` gives it.
 */
export function adopt(list: readonly IssueInput[], message?: Message): Fail {
  for (const each of list) {
    const found: Draft = { ...each, code: each.code ?? "custom", path: each.path === undefined ? [] : [...each.path] };
    if (message !== undefined && found.message === undefined) {
      say(found, message);
    }
    if (found.path.length > 1) {
      found.path.reverse();
    }
    (issues ??= []).push(found);
  }
  return FAIL;
}

/**
 * Places under `key` every issue reported since `mark`, which a composer does once a child refused its
 * value, and gives the mark for the next child. With no key the issues stay where they are, as the ones of
 * a child that placed its own.
 */
export function under(mark: number, key: ValidationPathSegment | undefined): number {
  // Nothing was reported in a validation that has no list yet, and it is given none for that.
  if (issues === undefined) {
    return 0;
  }
  if (key !== undefined) {
    for (let index = mark; index < issues.length; index += 1) {
      (issues[index] as Draft).path.push(key);
    }
  }
  return issues.length;
}

/**
 * How many issues a list holds, counting the ones an issue holds behind it in `params.issues`, as the
 * issue of a `union` holds every option's: counted as one, a thousand items that each failed a union of
 * lists held two million. Issues nest at most three deep, so this does too.
 */
const weigh = (found: unknown): number => {
  if (Array.isArray(found)) {
    let weight = 0;
    for (const each of found) {
      weight += weigh(each);
    }
    return weight;
  }
  const behind: unknown = (found as ValidationIssue | null)?.params?.["issues"];
  return behind === undefined ? 1 : 1 + weigh(behind);
};

/** How many issues were reported since `mark`, counted as the limit of a collection counts them. */
export function weightSince(mark: number): number {
  let weight = 0;
  for (let index = mark; index < count(); index += 1) {
    weight += weigh((issues as Draft[])[index]);
  }
  return weight;
}

/**
 * Cuts the issues a collection's items reported since `start` at {@link MAX_ISSUES}, counted as
 * {@link weightSince} counts them, when there are more, or when `isCut` says its items were not all run,
 * and adds the issue that says so: `too_big` with `type: "issues"`, at the collection, worded by its
 * `message`. Returns {@link FAIL}.
 */
export function cap(start: number, message: Message | undefined, isCut = false): Fail {
  const list = (issues ??= []);
  // Cut after the issue that reaches the limit, counting what each holds.
  let kept = start;
  for (let weight = 0; kept < list.length && weight < MAX_ISSUES; kept += 1) {
    weight += weigh(list[kept]);
  }
  if (isCut || kept < list.length) {
    list.length = kept;
    report("too_big", { maximum: MAX_ISSUES, type: "issues" }, message);
  }
  return FAIL;
}

/** Takes the issues reported since `mark` out of the validation running now, or undefined when none was. */
export function cut(mark: number): Draft[] | undefined {
  if (issues === undefined || issues.length <= mark) {
    return undefined;
  }
  if (mark > 0) {
    return issues.splice(mark);
  }
  // From the start it is the list itself, which is what an option of a `union` that failed leaves.
  const all = issues;
  issues = undefined;
  return all;
}

/** Puts back issues {@link cut} took out, from `from` up to `to`, placed under `key` when there is one. */
export function restore(
  list: Draft[] | undefined,
  key?: ValidationPathSegment,
  from = 0,
  to = list?.length ?? 0,
): void {
  for (let index = from; index < to; index += 1) {
    const found = (list as Draft[])[index] as Draft;
    if (key !== undefined) {
      found.path.push(key);
    }
    (issues ??= []).push(found);
  }
}

/**
 * Writes each path from the root, which is done once, when no composer has a key left to add. The path is
 * written anew and not turned round where it is: the list a path was written in only ever grows, so a
 * `lazy` keeps what it found for an object as that list and its length then, without a copy.
 */
export function straighten(list: Draft[]): ValidationIssue[] {
  for (const each of list) {
    if (each.path.length > 1) {
      each.path = [...each.path].reverse();
    }
  }
  return list;
}

/** The failure a validation ends with. */
export const finished = (list: Draft[]): ValidationErr => ({
  ok: false,
  error: { issues: straighten(list) as unknown as ValidationFailure["issues"] },
});

/**
 * One validation: how many calls each `lazy` it reached has made, and the results each kept, keyed by that
 * `lazy`. It is made by the first `lazy` that needs it, since most validations reach none.
 */
export interface Scope {
  calls?: Map<object, number>;
  results?: Map<object, unknown>;
}

/** The validation running now, when something has asked for it. */
let scope: Scope | undefined;

/**
 * The validation running now. It lasts until the call that was made from outside returns, and a result
 * that waits carries it into its continuations, so everything a validation reaches shares it.
 */
export const scopeNow = (): Scope => (scope ??= {});

/**
 * How many `lazy` levels are open where the code running now sits. A result that waits carries it into its
 * continuation, as it carries the validation, so a level opened before an await is still open after it and
 * `maxDepth` bounds recursion that waits between levels too.
 */
let depth = 0;

/** How many `lazy` levels are open where the code running now sits. */
export const levels = (): number => depth;

/** Sets how many `lazy` levels are open, which a `lazy` does around its child, restoring it in a `finally`. */
export const setLevels = (open: number): void => {
  depth = open;
};

/**
 * Runs a callback the consumer wrote, such as a check's test or a transform's function, apart from the
 * validation running now, so a validator it calls is a validation of its own, with counts of its own.
 */
export function detached<A, R>(callback: (argument: A) => R, argument: A): R {
  const held = scope;
  scope = undefined;
  try {
    return callback(argument);
  } finally {
    scope = held;
  }
}

/**
 * Remembers the validation running now and the `lazy` levels open in it, and gives a function that runs
 * `work` within them later, with a list of issues of its own, and returns what it produced and reported.
 */
export function context(): (work: () => unknown) => readonly [value: unknown, issues: Draft[] | undefined] {
  const validation = scopeNow();
  const open = depth;
  return (work) => {
    const outer = issues;
    const heldScope = scope;
    const heldDepth = depth;
    issues = undefined;
    scope = validation;
    depth = open;
    try {
      return [work(), issues];
    } finally {
      issues = outer;
      scope = heldScope;
      depth = heldDepth;
    }
  };
}

/**
 * Gives what `next` returns for what a run produced, now when it is ready and once it is otherwise. `next`
 * is also given where the issues reported since `mark` begin: at `mark` now, and at the start of a list of
 * its own later.
 */
export const after = (
  tools: Tools | undefined,
  mark: number,
  value: unknown,
  next: (value: unknown, from: number) => unknown,
): unknown => (tools !== undefined && tools.is(value) ? tools.after(mark, value, next) : next(value, mark));

/** The result of a value that passed. */
const passed = <T>(value: T): ValidationOk<T> => ({ ok: true, value });

/**
 * The public call of a validator: its run, with a list of issues of its own, whatever is running around
 * it. A validation that something asked for while it ran ends with it.
 */
export function call(run: Run, input: unknown): ValidationResult<unknown> | Promise<ValidationResult<unknown>> {
  const outer = issues;
  const held = scope;
  issues = undefined;
  try {
    const value = run(input);
    if (value === FAIL) {
      return finished(issues as unknown as Draft[]);
    }
    return run.w !== undefined && run.w.is(value) ? run.w.settle(value) : passed(value);
  } finally {
    issues = outer;
    scope = held;
  }
}
