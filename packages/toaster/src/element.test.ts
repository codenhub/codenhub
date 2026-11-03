import { beforeEach, describe, expect, it, vi } from "vitest";

import * as toastModule from ".";
import * as dialogModule from "./dialog";
import { DEFAULT_CONFIG, DEFAULT_DISMISS_LABEL, DEFAULT_REGION_LABEL } from "./options";
import type { RawToastOptions } from "./options";
import { Toast } from "./toast-base";

interface MockAnimation {
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  finished: Promise<void>;
  cancel: () => void;
}

beforeEach(() => {
  document.body.innerHTML = "";

  HTMLElement.prototype.animate = vi.fn().mockImplementation(() => {
    const animation: MockAnimation = {
      onfinish: null,
      oncancel: null,
      finished: Promise.resolve(),
      cancel(): void {
        animation.onfinish = null;
        animation.oncancel?.();
      },
    };
    return animation as unknown as Animation;
  });
});

function makeToast(options: RawToastOptions): Toast {
  return new Toast({
    options,
    config: {
      ...DEFAULT_CONFIG,
      instanceId: "test-instance",
      dismissLabel: DEFAULT_DISMISS_LABEL,
      regionLabel: DEFAULT_REGION_LABEL,
    },
    parent: document.body,
  });
}

function renderToast(toast: Toast): HTMLDivElement {
  toast.show();
  const element = document.body.querySelector(".coden-toast");
  if (!(element instanceof HTMLDivElement)) {
    throw new Error("Expected toast element to render.");
  }
  return element;
}

describe("toast public surface", () => {
  it("should only expose public runtime exports from the barrel", () => {
    expect(Object.keys(toastModule).sort()).toEqual(["createToaster", "toast"]);
  });

  it("should only expose public runtime exports from the dialog entry", () => {
    expect(Object.keys(dialogModule).sort()).toEqual(["createDialogs", "dialog"]);
  });
});

describe("Toast rendering", () => {
  it("should render toast content with main and actions regions", () => {
    const element = renderToast(makeToast({ message: "Saved successfully", dismissible: true }));

    expect(element.children).toHaveLength(2);
    expect(element.querySelector(".coden-toast-main")).not.toBeNull();
    expect(element.querySelector(".coden-toast-actions")).not.toBeNull();
    expect(element.hasAttribute("role")).toBe(false);
    expect(element.hasAttribute("aria-live")).toBe(false);
  });

  it("should use a compact dismiss button with a larger close icon", () => {
    const element = renderToast(makeToast({ message: "Saved successfully", dismissible: true }));
    const dismissButton = element.querySelector("button");
    const dismissIcon = dismissButton?.querySelector("svg");

    expect(element.className).toContain("coden-toast");
    expect(dismissButton?.className).toBe("coden-toast-dismiss");
    expect(dismissIcon).toBeInstanceOf(SVGElement);
    expect(dismissIcon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("should render a public icon before the message", () => {
    const element = renderToast(makeToast({ message: "Heads up", icon: "info" }));
    const icon = element.querySelector("svg");

    expect(icon).toBeInstanceOf(SVGElement);
    expect(icon?.getAttribute("class")).toContain("coden-toast-icon");
    expect(element.querySelector(".coden-toast-main")?.firstElementChild).toBe(icon);
  });

  it("should append className as the only public style hook", () => {
    const element = renderToast(makeToast({ message: "Saved successfully", className: "custom-toast" }));
    expect(element.className).toContain("custom-toast");
  });

  it("should render markup in string content as literal text, creating no elements", () => {
    const markup = '<div><a href="javascript:alert(1)">Link</a><script>alert("nested")</script></div>';
    const toast = makeToast({ content: markup });
    const element = renderToast(toast);
    expect(element.textContent).toContain(markup);
    expect(element.querySelector("a, script")).toBeNull();
  });
});
