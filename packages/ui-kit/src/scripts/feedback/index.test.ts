// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppErrorRegistry, DEFAULT_APP_ERROR_MESSAGE, type AppError } from "@codenhub/helpers/error";
import { err, ok, type Result } from "@codenhub/helpers/result";
import { getI18nInstance, I18n, setI18nInstance, type I18nConfig } from "../i18n";
import { feedback, type FeedbackEntry } from "./index";
import * as feedbackModule from "./index";

const i18nConfig: I18nConfig = {
  defaultLocale: "en-US",
  locales: ["en-US"],
  getLocaleFile: () => "/data/locales/en-US.json",
  getLocaleDirection: () => "ltr",
  isLocale: (value: string): value is string => value === "en-US",
};

interface MockAnimation {
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  finished: Promise<void>;
}

beforeEach(() => {
  document.body.innerHTML = "";
  AppErrorRegistry.clear();
  AppErrorRegistry.codes.add("invalid_credentials", {
    message: "Invalid email or password.",
  });
  setI18nInstance(new I18n(i18nConfig));

  HTMLElement.prototype.animate = vi.fn().mockImplementation(() => {
    const animation: MockAnimation = {
      onfinish: null,
      oncancel: null,
      finished: Promise.resolve(),
    };

    return animation as unknown as Animation;
  });
});

afterEach(() => {
  AppErrorRegistry.clear();
  vi.restoreAllMocks();
});

describe("feedback public surface", () => {
  it("should expose feedback as the only runtime API", () => {
    expect(Object.keys(feedbackModule).sort()).toEqual(["feedback"]);
  });
});

describe("feedback.register", () => {
  it("should return successful results, dispatch success events, and skip success toasts by default", () => {
    const result = ok({ id: "file-1" });
    const entries: FeedbackEntry[] = [];
    const unsubscribe = feedback.subscribe("success", ({ entry }) => {
      entries.push(entry);
    });

    const registeredResult = feedback.register(result);

    unsubscribe();
    expect(registeredResult).toBe(result);
    expect(entries).toEqual([{ type: "success", message: null }]);
    expect(document.body.querySelector("[role='status']")).toBeNull();
  });

  it("should show translated success feedback when a success message is provided", () => {
    vi.spyOn(getI18nInstance(), "translate").mockReturnValue("Arquivo salvo.");

    feedback.register(ok("saved"), {
      success: {
        key: "feedback.fileSaved",
        fallback: "File saved successfully.",
      },
    });

    expect(document.body.querySelector("[role='status']")?.textContent).toContain("Arquivo salvo.");
  });

  it("should use the success fallback when no translation exists", () => {
    vi.spyOn(getI18nInstance(), "translate").mockReturnValue(undefined);

    feedback.register(ok("saved"), {
      success: {
        key: "feedback.fileSaved",
        fallback: "File saved successfully.",
      },
    });

    expect(document.body.querySelector("[role='status']")?.textContent).toContain("File saved successfully.");
  });

  it("should use fallback messages when i18n has not been configured", () => {
    setI18nInstance(null);

    feedback.register(ok("saved"), {
      success: {
        key: "feedback.fileSaved",
        fallback: "File saved successfully.",
      },
    });

    expect(document.body.querySelector("[role='status']")?.textContent).toContain("File saved successfully.");
  });

  it("should log AppErrors, show known error messages, dispatch error events, and return the same result", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = err({ code: "invalid_credentials", name: "AuthApiError" });
    const errors: AppError[] = [];
    const unsubscribe = feedback.subscribe("error", ({ error }) => {
      errors.push(error);
    });

    const registeredResult: Result<never> = feedback.register(result);

    unsubscribe();
    expect(registeredResult).toBe(result);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Application error", result.error);
    expect(document.body.querySelector("[role='alert']")?.textContent).toContain("Invalid email or password.");
    expect(errors).toEqual([result.error]);
  });

  it("should use registration fallback for unknown error display without mutating the result", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = err(new Error("Unexpected failure"));

    feedback.register(result, {
      fallback: "Could not save file.",
    });

    expect(result.error.message).toBe(DEFAULT_APP_ERROR_MESSAGE);
    expect(document.body.querySelector("[role='alert']")?.textContent).toContain("Could not save file.");
  });

  it("should render feedback messages as text content", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    feedback.register(err(new Error("Unexpected failure")), {
      fallback: '<img src=x onerror="alert(1)">',
    });

    const toastElement = document.body.querySelector("[role='alert']");

    expect(toastElement?.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(toastElement?.querySelector("img")).toBeNull();
  });

  it("should respect toast, log, and toastPosition overrides", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    feedback.register(err(new Error("Failed to fetch")), {
      log: false,
      toast: false,
      toastPosition: "bottom-left",
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(document.getElementById("global-toast-container-bottom-left")).toBeNull();
  });

  it("should use requested toast positions when rendering toasts", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    feedback.register(err(new Error("Failed to fetch")), {
      toastPosition: "bottom-left",
    });

    expect(document.getElementById("global-toast-container-bottom-left")).toBeInstanceOf(HTMLDivElement);
  });

  it("should isolate listener failures and allow listeners to unsubscribe", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const remainingListener = vi.fn();
    const removedListener = vi.fn();
    const unsubscribeThrowing = feedback.subscribe("success", () => {
      throw new Error("listener failed");
    });
    const unsubscribeRemoved = feedback.subscribe("success", removedListener);
    const unsubscribeRemaining = feedback.subscribe("success", remainingListener);

    unsubscribeRemoved();

    expect(() => feedback.register(ok("saved"))).not.toThrow();

    unsubscribeThrowing();
    unsubscribeRemaining();
    expect(removedListener).not.toHaveBeenCalled();
    expect(remainingListener).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Feedback listener error", expect.any(Error));
  });
});
