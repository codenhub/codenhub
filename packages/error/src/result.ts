import { createAppError } from "./create-app-error";
import type { AppError, AppErrorOptions } from "./types";

/**
 * Represents a successful result value holding the resolved data.
 *
 * @typeParam T - The type of the value wrapped in the success result.
 */
export type Ok<T> = { ok: true; value: T };

/**
 * Represents a failed result value wrapping a normalized AppError.
 */
export type Err = { ok: false; error: AppError };

/**
 * A Result type representing either a successful outcome (`Ok<T>`) or a failure outcome (`Err`).
 * Useful for handling asynchronous or fallible operations without throwing exceptions.
 *
 * @typeParam T - The type of the value returned on success.
 */
export type Result<T> = Ok<T> | Err;

/**
 * Creates a successful Result instance wrapping the provided value.
 *
 * @typeParam T - The type of the value.
 * @param value - The success value to wrap.
 * @returns An Ok result object.
 */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/**
 * Creates a failed Result instance wrapping a normalized AppError.
 *
 * If the input error is a string, it is automatically treated as the fallback message.
 *
 * @param error - The raw error value to normalize.
 * @param options - Configuration options for AppError normalization.
 * @returns An Err result object.
 */
export const err = (error: unknown, options: AppErrorOptions = {}): Err => ({
  ok: false,
  error: createAppError(error, typeof error === "string" ? { fallbackMessage: error, ...options } : options),
});
