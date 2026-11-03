/**
 * Svelte adapter: handlers for a Svelte 5 `<svelte:boundary>` that work with normalized `AppError`s.
 *
 * @packageDocumentation
 */

import { createAppError, resolveAppErrorOptions } from "./create-app-error";
import type { AppError, AppErrorOptions } from "./types";

/**
 * Configuration for `createAppErrorBoundary`.
 */
export interface AppErrorBoundaryConfig {
  /** Normalization options for the caught value, such as `fallbackMessage` or `registry`. */
  readonly options?: AppErrorOptions;

  /**
   * Called once for each caught error, with its `AppError` and the boundary's `reset`. Report
   * `error.originalError` from here.
   */
  readonly onError?: (error: AppError, reset: () => void) => void;
}

/**
 * The handlers `createAppErrorBoundary` returns for one `<svelte:boundary>`.
 */
export interface AppErrorBoundaryHandlers {
  /** Pass as the boundary's `onerror`. Normalizes the error and calls the configured `onError`. */
  readonly onerror: (error: unknown, reset: () => void) => void;

  /**
   * Normalizes the value the boundary's `failed` snippet receives. For the error `onerror` saw, it
   * returns the same `AppError` instance `onError` received.
   */
  readonly toAppError: (error: unknown) => AppError;
}

/**
 * Creates the handlers for a Svelte 5 `<svelte:boundary>` (Svelte 5.3 or newer), so its `failed`
 * snippet shows a normalized message and its errors are reported once. Svelte is not imported;
 * the handlers only follow the shape the boundary calls.
 *
 * Like the boundary itself, it sees only errors thrown while rendering or running effects, not
 * those in event handlers or other asynchronous code; handle those with `attempt` or `attemptAsync`.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createAppErrorBoundary } from "@codenhub/error/svelte";
 *
 *   const boundary = createAppErrorBoundary({
 *     onError: (error) => tracker.captureException(error.originalError),
 *   });
 * </script>
 *
 * <svelte:boundary onerror={boundary.onerror}>
 *   <Page />
 *
 *   {#snippet failed(error, reset)}
 *     <p>{boundary.toAppError(error).message}</p>
 *     <button onclick={reset}>Try again</button>
 *   {/snippet}
 * </svelte:boundary>
 * ```
 *
 * @param config - Normalization options and the error callback.
 * @returns The `onerror` handler and the `toAppError` function for the `failed` snippet.
 * @throws {TypeError} If `config.options` or any supplied option value is invalid, or `onError` is
 * supplied and is not a function.
 */
export function createAppErrorBoundary(config: AppErrorBoundaryConfig = {}): AppErrorBoundaryHandlers {
  const { options = {}, onError } = config;

  // Validated here, where the boundary is set up, rather than when the first error is caught.
  resolveAppErrorOptions(options);

  if (onError !== undefined && typeof onError !== "function") {
    throw new TypeError("createAppErrorBoundary config.onError must be a function when provided.");
  }

  // The last value normalized, so onerror and the failed snippet share one AppError per error.
  let last: { readonly value: unknown; readonly error: AppError } | null = null;

  const toAppError = (value: unknown): AppError => {
    if (last === null || !Object.is(last.value, value)) {
      last = { value, error: createAppError(value, options) };
    }

    return last.error;
  };

  return Object.freeze({
    onerror: (value: unknown, reset: () => void): void => {
      onError?.(toAppError(value), reset);
    },
    toAppError,
  });
}
