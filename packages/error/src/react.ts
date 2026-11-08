/**
 * React adapter: an error boundary that hands its fallback a normalized `AppError`.
 *
 * @packageDocumentation
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

import { createAppError } from "./create-app-error";
import type { AppError, AppErrorOptions } from "./types";

/**
 * What an `AppErrorBoundary` passes to its `fallback`.
 */
export interface AppErrorBoundaryFallbackProps {
  /** The caught value, normalized with the boundary's `options`. */
  readonly error: AppError;

  /** Clears the error and renders the boundary's children again. */
  readonly reset: () => void;
}

/**
 * Props for `AppErrorBoundary`.
 */
export interface AppErrorBoundaryProps {
  /** The tree the boundary protects. */
  readonly children?: ReactNode;

  /** Renders in place of `children` after one of them throws. */
  readonly fallback: (props: AppErrorBoundaryFallbackProps) => ReactNode;

  /**
   * Called once for each caught error, after the fallback renders, with the same `AppError` the
   * fallback receives and React's error info. Report `error.originalError` from here.
   */
  readonly onError?: (error: AppError, info: ErrorInfo) => void;

  /** Called when the boundary resets, through `reset` or a change of `resetKeys`. */
  readonly onReset?: () => void;

  /** Normalization options for the caught value, such as `fallbackMessage` or `registry`. */
  readonly options?: AppErrorOptions;

  /**
   * Values that reset the boundary when any of them changes, compared with `Object.is`, such as
   * the current route.
   */
  readonly resetKeys?: readonly unknown[];
}

interface AppErrorBoundaryState {
  // Boxed, so a thrown `undefined` or `null` still counts as caught.
  readonly caught: { readonly value: unknown } | null;
}

const haveKeysChanged = (previous: readonly unknown[] = [], next: readonly unknown[] = []): boolean =>
  previous.length !== next.length || previous.some((value, index) => !Object.is(value, next[index]));

/**
 * An error boundary that catches what its children throw while rendering, normalizes it into an
 * `AppError`, and renders `fallback` with it.
 *
 * Like every React error boundary, it does not catch errors thrown in event handlers, in
 * asynchronous code, or during server rendering; handle those with `attempt` or `attemptAsync`.
 * An invalid `options` value throws from the boundary's render, to the boundary above it.
 *
 * @example
 * ```tsx
 * <AppErrorBoundary
 *   fallback={({ error, reset }) => <ErrorPanel message={error.message} onRetry={reset} />}
 *   onError={(error) => tracker.captureException(error.originalError)}
 *   resetKeys={[location.pathname]}
 * >
 *   <Page />
 * </AppErrorBoundary>
 * ```
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { caught: null };

  // The AppError for the caught value, so the fallback and onError share one instance. Keyed by the
  // value rather than the state, because React can derive the error state more than once per throw.
  #appError: { readonly value: unknown; readonly error: AppError } | null = null;

  static getDerivedStateFromError(value: unknown): AppErrorBoundaryState {
    return { caught: { value } };
  }

  override componentDidCatch(_value: unknown, info: ErrorInfo): void {
    const error = this.#getAppError();

    if (error !== null) {
      this.props.onError?.(error, info);
    }
  }

  override componentDidUpdate(previousProps: AppErrorBoundaryProps, previousState: AppErrorBoundaryState): void {
    // Only an error already on screen before this update is reset. When the key change is what made
    // a child throw, resetting now would render the same child, throw again, and report it twice.
    if (
      previousState.caught !== null &&
      this.state.caught !== null &&
      haveKeysChanged(previousProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  /** Clears the error and renders the children again. */
  reset = (): void => {
    if (this.state.caught === null) {
      return;
    }

    this.props.onReset?.();
    this.setState({ caught: null });
  };

  #getAppError(): AppError | null {
    const { caught } = this.state;

    if (caught === null) {
      return null;
    }

    if (this.#appError === null || !Object.is(this.#appError.value, caught.value)) {
      this.#appError = { value: caught.value, error: createAppError(caught.value, this.props.options) };
    }

    return this.#appError.error;
  }

  override render(): ReactNode {
    const error = this.#getAppError();

    return error === null ? this.props.children : this.props.fallback({ error, reset: this.reset });
  }
}
