import { DEFAULT_APP_ERROR_MESSAGE, type AppError, type Result } from "@codenhub/error";

import { getI18nInstance } from "../i18n";
import { SemanticToast, type ToastOptions } from "../toast";

export interface FeedbackMessage {
  key: string;
  fallback?: string;
}

export interface RegisterFeedbackOptions {
  success?: FeedbackMessage;
  fallback?: string;
  toast?: boolean;
  log?: boolean;
  toastPosition?: ToastOptions["position"];
}

export interface FeedbackEntry {
  type: "success" | "error";
  message: string | null;
}

export interface FeedbackEventMap {
  success: {
    entry: FeedbackEntry;
    value: unknown;
  };
  error: {
    entry: FeedbackEntry;
    error: AppError;
  };
}

type FeedbackEventName = keyof FeedbackEventMap;
type FeedbackListener<EventName extends FeedbackEventName> = (event: FeedbackEventMap[EventName]) => void;

const DEFAULT_SHOULD_LOG = true;
const DEFAULT_SHOULD_TOAST_ERROR = true;

class Feedback {
  private readonly listeners: {
    [EventName in FeedbackEventName]: Set<FeedbackListener<EventName>>;
  } = {
    success: new Set<FeedbackListener<"success">>(),
    error: new Set<FeedbackListener<"error">>(),
  };

  register<T>(result: Result<T>, options: RegisterFeedbackOptions = {}): Result<T> {
    if (result.ok) {
      this.registerSuccess(result.value, options);
      return result;
    }

    this.registerError(result.error, options);
    return result;
  }

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

export const feedback = new Feedback();
