// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Toast, type ToastOptions } from ".";
import * as toastModule from ".";

interface MockAnimation {
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  finished: Promise<void>;
}

const validToastOptions: ToastOptions = { message: "Saved successfully", className: "custom-toast" };
void validToastOptions;

beforeEach(() => {
  document.body.innerHTML = "";

  HTMLElement.prototype.animate = vi.fn().mockImplementation(() => {
    const animation: MockAnimation = {
      onfinish: null,
      oncancel: null,
      finished: Promise.resolve(),
    };
    return animation as unknown as Animation;
  });
});

function renderToast(toast: Toast): HTMLDivElement {
  toast.show();
  const element = document.body.querySelector("[role='status'], [role='alert']");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("Expected toast element to render.");
  }
  return element;
}

describe("toast public surface", () => {
  it("should only expose public runtime exports from the barrel", () => {
    expect(Object.keys(toastModule).sort()).toEqual([
      "AlertToast",
      "ConfirmToast",
      "LoadingToast",
      "PromptToast",
      "SemanticToast",
      "Toast",
      "createToaster",
    ]);
  });
});

describe("Toast rendering", () => {
  it("should render toast content on a single root element", () => {
    const element = renderToast(new Toast({ message: "Saved successfully", isDismissable: true }));

    expect(element.children).toHaveLength(2);
    expect(element.querySelector("div")).toBeNull();
    expect(element.getAttribute("role")).toBe("status");
    expect(element.getAttribute("aria-live")).toBe("polite");
    expect(element.getAttribute("aria-atomic")).toBe("true");
  });

  it("should use a compact dismiss button with a larger close icon", () => {
    const element = renderToast(new Toast({ message: "Saved successfully", isDismissable: true }));
    const dismissButton = element.querySelector("button");
    const dismissIcon = dismissButton?.querySelector("i");

    expect(element.className).toContain("p-3");
    expect(dismissButton?.className).toContain("size-4");
    expect(dismissIcon?.className).toContain("ic-close");
  });

  it("should render a public icon before the message", () => {
    const element = renderToast(new Toast({ message: "Heads up", icon: "info" }));
    const icon = element.querySelector("i");

    expect(icon).toBeInstanceOf(HTMLElement);
    expect(icon?.className).toContain("ic-info");
    expect(icon?.className).toContain("size-5");
    expect(element.firstElementChild).toBe(icon);
  });

  it("should append className as the only public style hook", () => {
    const element = renderToast(
      new Toast({
        message: "Saved successfully",
        className: "custom-toast",
      }),
    );
    expect(element.className).toContain("custom-toast");
  });
});
