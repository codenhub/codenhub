import { assertOrder, assertSize, toIssue } from "../core/result";
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
 * together, since each is a mistake in the schema and not in the input.
 */
export function assertSizeOptions({ min, max, length }: SizeOptions): void {
  for (const [name, size] of [
    ["Minimum size", min],
    ["Maximum size", max],
    ["Size", length],
  ] as const) {
    if (size !== undefined) {
      assertSize(name, size);
    }
  }
  assertOrder("min", min, "max", max);
  assertOrder("min", min, "length", length);
  assertOrder("length", length, "max", max);
}

/** The issues for a collection whose size breaks a constraint, empty when it satisfies them all. */
export function sizeIssues(size: number, type: string, { min, max, length }: SizeOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (min !== undefined && size < min) {
    issues.push(toIssue({ code: "too_small", params: { minimum: min, type } }));
  }
  if (max !== undefined && size > max) {
    issues.push(toIssue({ code: "too_big", params: { maximum: max, type } }));
  }
  if (length !== undefined && size !== length) {
    issues.push(
      toIssue(
        size < length
          ? { code: "too_small", params: { minimum: length, exact: true, type } }
          : { code: "too_big", params: { maximum: length, exact: true, type } },
      ),
    );
  }
  return issues;
}
