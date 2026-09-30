import { formatFactory } from "./text-format";

/**
 * An ISO 8601 duration: `P`, then years, months, weeks and days, then `T` and hours, minutes and
 * seconds, each optional but at least one present, and at least one after a `T`. Only the seconds may
 * have a fraction, written with a dot.
 */
const DURATION_PATTERN =
  /^P(?!$)(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/;

/**
 * Creates a validator for ISO 8601 durations such as `P1Y2M`, `PT30M` or `P1DT12H`. The value is not
 * modified.
 *
 * @example
 * ```ts
 * duration()("PT1H30M"); // { ok: true, value: "PT1H30M" }
 * duration()("P"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const duration = /* @__PURE__ */ formatFactory("duration", (text) =>
  DURATION_PATTERN.test(text) ? text : undefined,
);
