import { createAppError } from "./create-app-error";
import type { AppError, AppErrorOptions } from "./types";

/** Successful result value returned by `ok()`. */
export type Ok<T> = { ok: true; value: T };

/** Failed result value returned by `err()`. */
export type Err = { ok: false; error: AppError };

/** Result union for APIs that return success or failure without throwing. */
export type Result<T> = Ok<T> | Err;

/** Wraps a value in a successful result. */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/** Normalizes an unknown error value and wraps it in a failed result. */
export const err = (error: unknown, options: AppErrorOptions = {}): Err => ({
  ok: false,
  error: createAppError(error, typeof error === "string" ? { fallbackMessage: error, ...options } : options),
});
