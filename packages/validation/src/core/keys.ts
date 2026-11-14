/*
 * The issues of a key an output cannot take, which `object`, `record` and `map` report alike.
 */
import { issue, RESERVED_KEY } from "./result";
import { report, type Fail } from "./run";
import type { Message, ValidationPathSegment } from "./types";

export { RESERVED_KEY };

const refuseKey = (
  fact: Readonly<Record<string, unknown>>,
  message: Message | undefined,
  key: ValidationPathSegment | undefined,
): Fail => report("invalid_key", { issues: [issue("invalid_value", fact)] }, message, key);

/**
 * Reports an entry that would put {@link RESERVED_KEY} in an output nobody listed it for, at `key`, or at
 * the place its caller gives it when there is none. Reported as a bad key, since dropping it would hide
 * what the sender tried.
 */
export const refuseReserved = (message: Message | undefined, key?: ValidationPathSegment): Fail =>
  refuseKey({ reserved: true }, message, key);

/**
 * Reports an entry whose key, once its validator has changed it, is one an earlier entry already has.
 * Reported as a bad key, since keeping both would silently drop one of the values.
 */
export const refuseRepeated = (message: Message | undefined, key?: ValidationPathSegment): Fail =>
  refuseKey({ unique: true }, message, key);
