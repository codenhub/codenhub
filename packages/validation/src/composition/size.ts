import { assertOrder, assertSize, issue } from "../core/result";
import type { ValidationIssue } from "../core/types";

/** The names of the size options, for the options a collection reads. */
export const SIZE_OPTIONS = "min max length";

/** Size constraints shared by arrays, sets, maps and records, where the size of a record is its number of keys. Every option is optional. */
export interface SizeOptions {
  /** Requires at least this many items. A non-negative integer. */
  min?: number | undefined;
  /** Allows at most this many items. A non-negative integer. */
  max?: number | undefined;
  /** Requires exactly this many items. A non-negative integer. */
  length?: number | undefined;
}

/**
 * Rejects a size option that is not a number, or not a non-negative integer, and limits no size can satisfy
 * together, since each is a mistake in the schema and not in the input. `noun` is what the messages call
 * the size, such as the length of a string.
 */
export function assertSizeOptions({ min, max, length }: SizeOptions, noun = "Size"): void {
  const lower = noun.toLowerCase();
  for (const [name, size] of [
    [`Minimum ${lower}`, min],
    [`Maximum ${lower}`, max],
    [noun, length],
  ] as const) {
    if (size !== undefined) {
      assertSize(name, size);
    }
  }
  assertOrder("min", min, "max", max);
  assertOrder("min", min, "length", length);
  assertOrder("length", length, "max", max);
}

/**
 * The issues for a value whose size breaks a constraint, added to `issues`, which is a new list unless one
 * is given, and empty when the size satisfies them all.
 */
export function sizeIssues(
  size: number,
  type: string,
  { min, max, length }: SizeOptions,
  issues: ValidationIssue[] = [],
): ValidationIssue[] {
  if (min !== undefined && size < min) {
    issues.push(issue("too_small", { minimum: min, type }));
  }
  if (max !== undefined && size > max) {
    issues.push(issue("too_big", { maximum: max, type }));
  }
  if (length !== undefined && size !== length) {
    issues.push(
      size < length
        ? issue("too_small", { minimum: length, exact: true, type })
        : issue("too_big", { maximum: length, exact: true, type }),
    );
  }
  return issues;
}
