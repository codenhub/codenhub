import { classifyErrorCandidate, getErrorCandidates } from "./normalize";
import { createErrorRegistry } from "./registry";
import type { AppErrorOptions, AppErrorSource, AppErrorType, ErrorRegistry } from "./types";

interface AppErrorResolution {
  type: AppErrorType;
  message: string;
  messageKey: string | null;
  source: AppErrorSource;
  originalError: unknown;
  retryable: boolean;
}

/** Default message used when no registry entry or fallback message can describe an error. */
export const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";

/** Error class that normalizes unknown thrown or returned values into a predictable shape. */
export class AppError extends Error {
  /** App-level registry used when no registry is passed to the constructor. */
  static readonly registry: ErrorRegistry = createErrorRegistry();

  /** Creates an isolated registry without modifying the app-level registry. */
  static createRegistry(): ErrorRegistry {
    return createErrorRegistry();
  }

  /** Classification assigned after registry lookup and fallback handling. */
  readonly type: AppErrorType;
  /** User-facing message resolved from registry feedback or fallback handling. */
  declare readonly message: string;
  /** Optional localization key from matched registry feedback. */
  readonly messageKey: string | null;
  /** Optional source label from matched registry feedback. */
  readonly source: AppErrorSource;
  /** Original value passed to the constructor, or the original value from a wrapped `AppError`. */
  readonly originalError: unknown;
  /** Whether retrying the failed operation is likely to help. */
  readonly retryable: boolean;

  /**
   * Normalizes an unknown error value. Construction does not throw; unmatched values become `unknown` errors.
   */
  constructor(error: unknown, options: AppErrorOptions = {}) {
    const resolved = AppError.resolve(error, options);

    super(resolved.message);

    Object.setPrototypeOf(this, new.target.prototype);

    this.name = "AppError";
    this.type = resolved.type;
    this.messageKey = resolved.messageKey;
    this.source = resolved.source;
    this.originalError = resolved.originalError;
    this.retryable = resolved.retryable;
  }

  private static resolve(error: unknown, options: AppErrorOptions): AppErrorResolution {
    if (error instanceof AppError) {
      return {
        type: error.type,
        message: error.message,
        messageKey: error.messageKey,
        source: error.source,
        originalError: error.originalError,
        retryable: error.retryable,
      };
    }

    const fallbackMessage = options.fallbackMessage ?? DEFAULT_APP_ERROR_MESSAGE;
    const errorCandidates = getErrorCandidates(error);
    const registry = options.registry ?? AppError.registry;

    for (const errorCandidate of errorCandidates) {
      const classification = classifyErrorCandidate(registry, errorCandidate);

      if (classification !== null) {
        return {
          type: classification.type,
          message: classification.message,
          messageKey: classification.messageKey,
          source: classification.source,
          originalError: error,
          retryable: classification.retryable,
        };
      }
    }

    return {
      type: "unknown",
      message: fallbackMessage,
      messageKey: null,
      source: null,
      originalError: error,
      retryable: false,
    };
  }
}
