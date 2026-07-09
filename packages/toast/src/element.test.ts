// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as toastModule from ".";
import { DEFAULT_CONFIG } from "./options";
import type { RawToastOptions } from "./options";
import { Toast } from "./toast-base";

interface MockAnimation {
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  finished: Promise<void>;
}

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

function makeToast(options: RawToastOptions): Toast {
  return new Toast({
    options,
    config: { ...DEFAULT_CONFIG, instanceId: "test-instance" },
    parent: document.body,
  });
}

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
    expect(Object.keys(toastModule).sort()).toEqual(["LoadingToast", "SemanticToast", "Toast", "createToaster"]);
  });
});

describe("Toast rendering", () => {
  it("should render toast content on a single root element", () => {
    const element = renderToast(makeToast({ message: "Saved successfully", isDismissable: true }));

    expect(element.children).toHaveLength(2);
    expect(element.querySelector("div")).toBeNull();
    expect(element.getAttribute("role")).toBe("status");
    expect(element.getAttribute("aria-live")).toBe("polite");
    expect(element.getAttribute("aria-atomic")).toBe("true");
  });

  it("should use a compact dismiss button with a larger close icon", () => {
    const element = renderToast(makeToast({ message: "Saved successfully", isDismissable: true }));
    const dismissButton = element.querySelector("button");
    const dismissIcon = dismissButton?.querySelector("svg");

    expect(element.className).toContain("p-3");
    expect(dismissButton?.className).toContain("size-4");
    // Dismiss button resets the global `btn` base rule applied by @codenhub/styles/native.css
    expect(dismissButton?.className).toContain("bg-transparent");
    expect(dismissButton?.className).toContain("border-0");
    expect(dismissButton?.className).toContain("min-h-0");
    expect(dismissIcon).toBeInstanceOf(SVGElement);
    // Dimensions are set via inline styles (highest CSS specificity) so no CSS rule can override them.
    // SVG presentation attributes (width/height HTML attrs) have zero specificity and are
    // overridden by even the lowest-specificity CSS rule, causing the icon to render at 0×24.
    expect((dismissIcon as SVGElement | null)?.style.width).toBe("1rem");
    expect((dismissIcon as SVGElement | null)?.style.height).toBe("1rem");
  });

  it("should render a public icon before the message", () => {
    const element = renderToast(makeToast({ message: "Heads up", icon: "info" }));
    const icon = element.querySelector("svg");

    expect(icon).toBeInstanceOf(SVGElement);
    expect(icon?.getAttribute("class")).toContain("size-5");
    expect(element.firstElementChild).toBe(icon);
  });

  it("should append className as the only public style hook", () => {
    const element = renderToast(makeToast({ message: "Saved successfully", className: "custom-toast" }));
    expect(element.className).toContain("custom-toast");
  });

  it("should apply tokens option as inline styles on the root element", () => {
    const element = renderToast(
      makeToast({
        message: "Custom styled",
        tokens: {
          success: "rgb(255, 0, 0)",
          successSubtle: "rgb(0, 255, 0)",
        },
      }),
    );
    expect(element.style.getPropertyValue("--toast-color-success")).toBe("rgb(255, 0, 0)");
    expect(element.style.getPropertyValue("--toast-color-success-subtle")).toBe("rgb(0, 255, 0)");
  });
});
