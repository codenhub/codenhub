import { createAppError, resolveAppErrorOptions } from "./create-app-error";
import type { AppError, AppErrorOptions } from "./types";

/**
 * Represents a successful result value holding the resolved data.
 *
 * @typeParam T - The type of the value wrapped in the success result.
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Represents a failed result value wrapping a normalized AppError.
 */
export interface Err {
  readonly ok: false;
  readonly error: AppError;
}

/**
 * A Result type representing either a successful outcome (`Ok<T>`) or a failure outcome (`Err`).
 * Useful for handling asynchronous or fallible operations without throwing exceptions.
 *
 * @typeParam T - The type of the value returned on success.
 */
export type Result<T> = Ok<T> | Err;

/**
 * Creates a successful Result instance wrapping the provided value.
 * If no value is provided, returns an Ok<void> result.
 *
 * @typeParam T - The type of the value.
 * @param value - The optional success value to wrap.
 * @returns An Ok result object.
 */
export function ok(): Ok<void>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T> {
  return Object.freeze({ ok: true, value: value as T });
}

/**
 * Creates a failed Result instance wrapping a normalized AppError.
 *
 * A raw string is matched against the registry like any other value. An unmatched string does not
 * become the message; supply `fallbackMessage` when user-facing text is needed.
 *
 * @param error - The raw error value to normalize.
 * @param options - Configuration options for AppError normalization.
 * @returns An Err result object.
 * @throws TypeError - If `options` or any supplied option value is invalid.
 */
export const err = (error: unknown, options: AppErrorOptions = {}): Err =>
  Object.freeze({
    ok: false,
    error: createAppError(error, options),
  });

/**
 * Runs a callback and captures a thrown value as a normalized `Err` instead of propagating it.
 *
 * This is the boundary helper for wrapping code that throws: the callback result becomes `Ok`,
 * and anything thrown is normalized through the same pipeline as `createAppError`.
 *
 * @typeParam T - The type returned by the callback on success.
 * @param operation - The callback to run.
 * @param options - Configuration options for AppError normalization.
 * @returns An Ok result holding the callback value, or an Err holding the normalized failure.
 * @throws TypeError - If `options` or any supplied option value is invalid.
 */
export const attempt = <T>(operation: () => T, options: AppErrorOptions = {}): Result<T> => {
  // Validated up front so invalid options surface immediately instead of only on the failure path.
  resolveAppErrorOptions(options);

  try {
    return ok(operation());
  } catch (caughtError) {
    return err(caughtError, options);
  }
};

/**
 * Runs an async callback and captures a thrown or rejected value as a normalized `Err`.
 *
 * @typeParam T - The type the callback resolves to on success.
 * @param operation - The asynchronous callback to run.
 * @param options - Configuration options for AppError normalization.
 * @returns A Promise resolving to an Ok result holding the awaited value, or an Err holding the
 * normalized failure. The promise does not reject for failures raised by `operation`.
 * @throws TypeError - If `options` or any supplied option value is invalid.
 */
export const attemptAsync = async <T>(
  operation: () => Promise<T> | T,
  options: AppErrorOptions = {},
): Promise<Result<T>> => {
  // Validated up front so invalid options surface immediately instead of only on the failure path.
  resolveAppErrorOptions(options);

  try {
    return ok(await operation());
  } catch (caughtError) {
    return err(caughtError, options);
  }
};

/**
 * Unwraps a Result, returning the value if successful, or throwing the normalized AppError if failed.
 *
 * @typeParam T - The type of the value.
 * @param result - The Result instance to unwrap.
 * @returns The unwrapped success value.
 * @throws AppError - If the result is an Err.
 */
export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
};

/**
 * Maps the success value of a Result using the provided mapper function.
 *
 * @typeParam T - The type of the original value.
 * @typeParam U - The type of the mapped value.
 * @param result - The Result instance to map.
 * @param mapper - The function to map the success value.
 * @returns A new Result instance with the mapped value or the original Err.
 * @throws The exception thrown by `mapper`; callback failures are not normalized.
 */
export const map = <T, U>(result: Result<T>, mapper: (value: T) => U): Result<U> => {
  if (!result.ok) {
    return result;
  }
  return ok(mapper(result.value));
};

/**
 * Pattern matches on a Result, executing the corresponding callback based on the outcome.
 *
 * @typeParam T - The type of the success value.
 * @typeParam U - The type of the return value from the callbacks.
 * @param result - The Result instance to match.
 * @param callbacks - An object containing onOk and onErr callback functions.
 * @returns The value returned by the executed callback.
 * @throws The exception thrown by the selected callback; callback failures are not normalized.
 */
export const match = <T, U>(
  result: Result<T>,
  callbacks: {
    readonly onOk: (value: T) => U;
    readonly onErr: (error: AppError) => U;
  },
): U => {
  if (result.ok) {
    return callbacks.onOk(result.value);
  }
  return callbacks.onErr(result.error);
};

/**
 * Maps the success value of a Result using the provided mapper function that returns another Result.
 * Prevents nested Result structures like `Result<Result<U>>`.
 *
 * @typeParam T - The type of the original success value.
 * @typeParam U - The type of the mapped success value.
 * @param result - The Result instance to process.
 * @param mapper - The function to map the success value to a new Result.
 * @returns A new Result instance from the mapper or the original Err.
 * @throws The exception thrown by `mapper`; callback failures are not normalized.
 */
export const andThen = <T, U>(result: Result<T>, mapper: (value: T) => Result<U>): Result<U> => {
  if (!result.ok) {
    return result;
  }
  return mapper(result.value);
};

/**
 * Unwraps a Result, returning the value if successful, or the provided fallback value if failed.
 *
 * @typeParam T - The type of the value.
 * @param result - The Result instance to unwrap.
 * @param fallback - The value to return if the result is an Err.
 * @returns The success value or the fallback value.
 */
export const unwrapOr = <T>(result: Result<T>, fallback: T): T => {
  if (!result.ok) {
    return fallback;
  }
  return result.value;
};

/**
 * Maps the success value of a Result asynchronously using the provided async mapper function.
 *
 * @typeParam T - The type of the original value.
 * @typeParam U - The type of the mapped value.
 * @param result - The Result instance to map.
 * @param mapper - The asynchronous function to map the success value.
 * @returns A Promise resolving to a new Result instance with the mapped value or the original Err. The promise rejects
 * if `mapper` throws or rejects; callback failures are not normalized.
 */
export const mapAsync = async <T, U>(result: Result<T>, mapper: (value: T) => Promise<U>): Promise<Result<U>> => {
  if (!result.ok) {
    return result;
  }
  return ok(await mapper(result.value));
};

/**
 * Maps the success value of a Result asynchronously using the provided mapper function that returns a Promise of another Result.
 * Prevents nested Result structures in asynchronous pipelines.
 *
 * @typeParam T - The type of the original success value.
 * @typeParam U - The type of the mapped success value.
 * @param result - The Result instance to process.
 * @param mapper - The asynchronous function to map the success value to a Promise of a new Result.
 * @returns A Promise resolving to the Result returned by the mapper or the original Err. The promise rejects if
 * `mapper` throws or rejects; callback failures are not normalized.
 */
export const andThenAsync = async <T, U>(
  result: Result<T>,
  mapper: (value: T) => Promise<Result<U>>,
): Promise<Result<U>> => {
  if (!result.ok) {
    return result;
  }
  return mapper(result.value);
};
