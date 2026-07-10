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
    expect(Object.keys(toastModule)).toEqual(["createToaster"]);
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

    expect(element.className).toContain("coden-toast");
    expect(dismissButton?.className).toBe("coden-toast-dismiss");
    expect(dismissIcon).toBeInstanceOf(SVGElement);
    // Dimensions are set via inline styles (highest CSS specificity) so no CSS rule can override them.
    // SVG presentation attributes (width/height HTML attrs) have zero specificity and are
    // overridden by even the lowest-specificity CSS rule, causing the icon to render at 0×24.
    expect(dismissIcon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("should render a public icon before the message", () => {
    const element = renderToast(makeToast({ message: "Heads up", icon: "info" }));
    const icon = element.querySelector("svg");

    expect(icon).toBeInstanceOf(SVGElement);
    expect(icon?.getAttribute("class")).toContain("coden-toast-icon");
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

  it("should sanitize nested script elements inside invalid elements", () => {
    const toast = makeToast({
      content: '<div><invalid-tag><script>alert("nested")</script></invalid-tag></div>',
    });
    const element = renderToast(toast);
    expect(element.innerHTML).not.toContain("<script>");
    expect(element.innerHTML).not.toContain("alert");
  });

  it("should strip unsafe URL protocols and zero-width spaces in href", () => {
    const toast = makeToast({
      content: `<div>
        <a id="link-js" href="javascript:alert(1)">JS Link</a>
        <a id="link-js-zw" href="java\u200Bscript:alert(1)">JS Zero Width Link</a>
        <a id="link-data" href="data:text/html,alert(1)">Data Link</a>
        <a id="link-file" href="file:///etc/passwd">File Link</a>
        <a id="link-http" href="https://example.com">HTTPS Link</a>
        <a id="link-mail" href="mailto:test@example.com">Mail Link</a>
        <a id="link-tel" href="tel:+12345">Tel Link</a>
        <a id="link-rel" href="/dashboard">Relative Link</a>
      </div>`,
    });
    const element = renderToast(toast);

    const links = Array.from(element.querySelectorAll("a"));
    expect(links.slice(0, 4).every((link) => !link.hasAttribute("href"))).toBe(true);
    expect(links[4]?.getAttribute("href")).toBe("https://example.com");
    expect(links[5]?.getAttribute("href")).toBe("mailto:test@example.com");
    expect(links[6]?.getAttribute("href")).toBe("tel:+12345");
    expect(links[7]?.getAttribute("href")).toBe("/dashboard");
  });

  it("should apply default appearance to root class name", () => {
    const element = renderToast(makeToast({ message: "Default appearance" }));
    expect(element.className).toContain("toast-appearance-soft-bordered");
  });

  it("should apply flat appearance to root class name", () => {
    const element = renderToast(makeToast({ message: "Flat appearance", appearance: "flat" }));
    expect(element.className).toContain("toast-appearance-flat");
  });

  it("should apply soft appearance to root class name", () => {
    const element = renderToast(makeToast({ message: "Soft appearance", appearance: "soft" }));
    expect(element.className).toContain("toast-appearance-soft");
  });

  it("should apply soft-bordered appearance to root class name", () => {
    const element = renderToast(makeToast({ message: "Soft bordered appearance", appearance: "soft-bordered" }));
    expect(element.className).toContain("toast-appearance-soft-bordered");
  });

  it("should apply left-accent appearance to root class name", () => {
    const element = renderToast(makeToast({ message: "Left accent appearance", appearance: "left-accent" }));
    expect(element.className).toContain("toast-appearance-left-accent");
  });
});
