/*
 * How composers report issues deep inside a value without copying paths at every level. A validator
 * called on its own reports paths relative to its input. A composer calling a composer of this package
 * tells it instead where its value sits, as a `Place`, and the inner one writes each issue's path in
 * full, once. Copying at every level would cost the square of the depth for each issue, which recursive
 * input controls. Any other validator, such as one written by hand, is called as usual, and its issues
 * are moved under the place once.
 */
import { chain, within, type Maybe } from "./async";
import { failWith, isResult, notResult, ROOT_PATH } from "./result";
import type { AnyValidator, ValidationIssue, ValidationPathSegment, ValidationResult } from "./types";

/**
 * Where a value sits below the value the outermost composer was called with: its segment and where its
 * parent sits, or undefined for that value itself. Each level adds one link, without copying.
 */
export type Place = { readonly segment: ValidationPathSegment; readonly parent: Place } | undefined;

/** A composer's work: validates `input`, found at `place`, and reports every issue at its full path. */
export type Run = (input: unknown, place: Place) => Maybe<ValidationResult<unknown>>;

/** The work of each composer this package made, so another can reach it with a place. */
const runs = new WeakMap<object, Run>();

/** The place of a value one segment below `place`. */
export const below = (place: Place, segment: ValidationPathSegment): Place => ({ segment, parent: place });

/** The full path of something at `path` below `place`, written once. */
export function pathAt(
  place: Place,
  path: readonly ValidationPathSegment[] = ROOT_PATH,
): readonly ValidationPathSegment[] {
  if (place === undefined) {
    return path;
  }
  let depth = 0;
  for (let node: Place = place; node !== undefined; node = node.parent) {
    depth += 1;
  }
  const full: ValidationPathSegment[] = Array.from({ length: depth + path.length });
  let index = depth;
  for (let node: Place = place; node !== undefined; node = node.parent) {
    index -= 1;
    full[index] = node.segment;
  }
  path.forEach((segment, offset) => {
    full[depth + offset] = segment;
  });
  return full;
}

/**
 * Adds issues a child reported at their full paths to its parent's list. It pushes one by one because
 * spreading a long list into `push` passes each as an argument, which overflows the stack past about
 * 120,000 issues and would turn bad input into an exception.
 */
export function append(target: ValidationIssue[], issues: readonly ValidationIssue[]): void {
  for (const found of issues) {
    target.push(found);
  }
}

/** Moves issues reported relative to a value to that value's place. */
export const placeAll = (issues: readonly ValidationIssue[], place: Place): ValidationIssue[] =>
  place === undefined
    ? [...issues]
    : issues.map((found) => ({ ...found, path: pathAt(place, found.path ?? ROOT_PATH) }));

/**
 * Makes a composer from its work: called on its own, it validates from the root, as one run, and
 * reports paths relative to its input; another composer reaches its work directly, with a place.
 */
export function composed(run: Run): (input: unknown) => Maybe<ValidationResult<unknown>> {
  const fromRoot = (input: unknown): Maybe<ValidationResult<unknown>> => run(input, undefined);
  const validator = (input: unknown): Maybe<ValidationResult<unknown>> => within(fromRoot, input);
  runs.set(validator, run);
  return validator;
}

/**
 * Validates a value found at `place` with any validator, and returns its result with every issue at
 * its full path: a composer of this package writes them so itself, and any other validator's issues are
 * moved there once. An issue written by hand without a path is given the place as its path; at the root
 * it is returned as the validator wrote it. A validator that returns no result is a mistake in the
 * schema, named by its place.
 */
export function call(validator: AnyValidator, input: unknown, place: Place): Maybe<ValidationResult<unknown>> {
  const run = runs.get(validator);
  if (run !== undefined) {
    return run(input, place);
  }
  return chain(validator(input), (result: ValidationResult<unknown>) => {
    if (!isResult(result)) {
      throw notResult(`The validator at ${pathAt(place).join(".") || "the root"}`);
    }
    return result.ok || place === undefined ? result : failWith(placeAll(result.error.issues, place));
  });
}
