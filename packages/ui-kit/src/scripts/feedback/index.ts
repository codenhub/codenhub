import { DEFAULT_APP_ERROR_MESSAGE, type AppError, type Result } from "@codenhub/error";

import { getI18nInstance } from "../i18n";
import { SemanticToast, type ToastOptions } from "../toast";

/** Translation key and optional plain-text fallback for successful feedback. */
export interface FeedbackMessage {
  /** Key resolved through the active UI Kit i18n instance. */
  key: string;
  /** Text used when the key cannot be translated. */
  fallback?: string;
}

/** Controls message resolution, diagnostics, and toast display for a registered result. */
export interface RegisterFeedbackOptions {
  /** Success message definition; providing it enables the success toast by default. */
  success?: FeedbackMessage;
  /** Text used only for an unknown error carrying the default application-error message. */
  fallback?: string;
  /** Overrides the result-specific toast default. Errors default to true; successes require a message definition. */
  toast?: boolean;
  /** Whether errors are written to `console.error`; defaults to true. */
  log?: boolean;
  /** Corner used for a generated toast; defaults to the toast API's top-right position. */
  toastPosition?: ToastOptions["position"];
}

/** Resolved feedback record delivered to subscribers. */
export interface FeedbackEntry {
  /** Result branch that produced the record. */
  type: "success" | "error";
  /** Resolved display text, or null when successful feedback has no message. */
  message: string | null;
}

/** Payloads delivered by each feedback subscription channel. */
export interface FeedbackEventMap {
  /** Successful result payload with its unchanged result value. */
  success: {
    /** Resolved feedback metadata. */
    entry: FeedbackEntry;
    /** Value carried by the successful result. */
    value: unknown;
  };
  /** Failed result payload with its normalized application error. */
  error: {
    /** Resolved feedback metadata. */
    entry: FeedbackEntry;
    /** Error carried by the failed result. */
    error: AppError;
  };
}

type FeedbackEventName = keyof FeedbackEventMap;
type FeedbackListener<EventName extends FeedbackEventName> = (event: FeedbackEventMap[EventName]) => void;

const DEFAULT_SHOULD_LOG = true;
const DEFAULT_SHOULD_TOAST_ERROR = true;

/** Coordinates result feedback for the exported application-wide singleton. */
class Feedback {
  private readonly listeners: {
    [EventName in FeedbackEventName]: Set<FeedbackListener<EventName>>;
  } = {
    success: new Set<FeedbackListener<"success">>(),
    error: new Set<FeedbackListener<"error">>(),
  };

  /**
   * Applies logging, translated-message, toast, and subscription side effects for a result.
   *
   * @param result - Result to report and return unchanged.
   * @param options - Overrides for message resolution, logging, and toast display.
   * @returns The same result object supplied by the caller.
   * @throws When enabled toast rendering cannot use the current DOM environment.
   */
  register<T>(result: Result<T>, options: RegisterFeedbackOptions = {}): Result<T> {
    if (result.ok) {
      this.registerSuccess(result.value, options);
      return result;
    }

    this.registerError(result.error, options);
    return result;
  }

  /**
   * Subscribes to one result branch for the lifetime of the module singleton.
   * Listener failures are logged and isolated from other subscribers.
   *
   * @returns A function that removes the listener.
   */
  subscribe<EventName extends FeedbackEventName>(
    eventName: EventName,
    listener: FeedbackListener<EventName>,
  ): () => void {
    this.listeners[eventName].add(listener);

    return () => {
      this.listeners[eventName].delete(listener);
    };
  }

  private registerSuccess(value: unknown, options: RegisterFeedbackOptions): void {
    const message = this.resolveSuccessMessage(options.success);
    const entry: FeedbackEntry = {
      type: "success",
      message,
    };

    if (message !== null && (options.toast ?? options.success !== undefined)) {
      this.showToast("success", message, options.toastPosition);
    }

    this.dispatch("success", { entry, value });
  }

  private registerError(error: AppError, options: RegisterFeedbackOptions): void {
    const message = this.resolveErrorMessage(error, options.fallback);
    const entry: FeedbackEntry = {
      type: "error",
      message,
    };

    if (options.log ?? DEFAULT_SHOULD_LOG) {
      console.error("Application error", error);
    }

    if (message !== null && (options.toast ?? DEFAULT_SHOULD_TOAST_ERROR)) {
      this.showToast("error", message, options.toastPosition);
    }

    this.dispatch("error", { entry, error });
  }

  private resolveSuccessMessage(message: FeedbackMessage | undefined): string | null {
    if (message === undefined) {
      return null;
    }

    return translateFeedbackMessage(message.key) ?? message.fallback ?? null;
  }

  private resolveErrorMessage(error: AppError, fallback: string | undefined): string | null {
    if (error.messageKey !== null) {
      return translateFeedbackMessage(error.messageKey) ?? error.message;
    }

    if (error.type === "unknown" && error.message === DEFAULT_APP_ERROR_MESSAGE && fallback !== undefined) {
      return fallback;
    }

    return error.message;
  }

  private showToast(type: "success" | "error", message: string, position: ToastOptions["position"]): void {
    new SemanticToast({
      type,
      message,
      position,
    }).show();
  }

  private dispatch<EventName extends FeedbackEventName>(
    eventName: EventName,
    event: FeedbackEventMap[EventName],
  ): void {
    for (const listener of this.listeners[eventName]) {
      try {
        listener(event);
      } catch (error) {
        console.error("Feedback listener error", error);
      }
    }
  }
}

function translateFeedbackMessage(key: string): string | undefined {
  try {
    return getI18nInstance().translate(key);
  } catch {
    return undefined;
  }
}

/** Shared feedback coordinator; consumers must unsubscribe listeners they no longer own. */
export const feedback = new Feedback();
