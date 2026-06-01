// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoadingToast, SemanticToast, Toast, type ToastOptions } from ".";
import * as toastModule from ".";

interface MockAnimation {
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  finished: Promise<void>;
}

const validToastOptions: ToastOptions = { message: "Saved successfully", className: "custom-toast" };
// @ts-expect-error layoutClassName is intentionally not part of the public options contract.
const invalidStyleSlotOptions: ToastOptions = { message: "Saved successfully", layoutClassName: "not-public" };
const invalidLoadingIconOptions: ConstructorParameters<typeof LoadingToast>[0] = {
  message: "Changing language...",
  // @ts-expect-error LoadingToast owns its variant icon preset.
  icon: "success",
};
const invalidSemanticIconOptions: ConstructorParameters<typeof SemanticToast>[0] = {
  type: "success",
  message: "Saved successfully",
  // @ts-expect-error SemanticToast owns its variant icon preset.
  icon: "info",
};
void validToastOptions;
void invalidStyleSlotOptions;
void invalidLoadingIconOptions;
void invalidSemanticIconOptions;

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
    expect(Object.keys(toastModule).sort()).toEqual(["LoadingToast", "SemanticToast", "Toast"]);
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
    expect(dismissButton?.className).not.toContain("hover:bg-foreground");
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
        layoutClassName: "not-public",
        colorClassName: "also-not-public",
      } as ToastOptions),
    );

    expect(element.className).toContain("custom-toast");
    expect(element.className).not.toContain("not-public");
    expect(element.className).not.toContain("also-not-public");
  });

  it("should preserve live node content instead of cloning it", () => {
    const content = document.createElement("button");
    const onClick = vi.fn();

    content.textContent = "Undo";
    content.addEventListener("click", onClick);

    const element = renderToast(new Toast({ content }));
    const renderedButton = element.querySelector("button");

    expect(renderedButton).toBe(content);

    renderedButton?.click();

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("should let custom content own the full inner markup", () => {
    const content = document.createElement("strong");
    content.textContent = "Custom content";

    const element = renderToast(new Toast({ icon: "info", content }));

    expect(element.children).toHaveLength(1);
    expect(element.firstElementChild).toBe(content);
    expect(element.querySelector("i")).toBeNull();
  });
});

describe("LoadingToast", () => {
  it("should apply loading preset defaults", () => {
    const element = renderToast(new LoadingToast({ message: "Changing language..." }));

    expect(element.getAttribute("role")).toBe("status");
    expect(element.className).toContain("min-w-44");
    expect(element.textContent).toContain("Changing language...");
  });

  it("should render a spinning loading icon before the message", () => {
    const element = renderToast(new LoadingToast({ message: "Changing language..." }));
    const loadingIcon = element.querySelector("i");

    expect(loadingIcon).toBeInstanceOf(HTMLElement);
    expect(loadingIcon?.className).toContain("ic-loader");
    expect(loadingIcon?.className).toContain("animate-spin");
    expect(element.firstElementChild).toBe(loadingIcon);
  });

  it("should not auto-dismiss by default", () => {
    vi.useFakeTimers();
    const toast = new LoadingToast({ message: "Changing language..." });
    const onHide = vi.fn();

    toast.onHide(onHide);
    toast.show();
    vi.advanceTimersByTime(4000);

    expect(onHide).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("SemanticToast", () => {
  it("should render a semantic icon before the message", () => {
    const semanticTypes = ["success", "info", "warning", "error"] as const;

    semanticTypes.forEach((type) => {
      document.body.innerHTML = "";

      const element = renderToast(new SemanticToast({ type, message: "Saved successfully" }));
      const icon = element.querySelector("i");

      expect(icon).toBeInstanceOf(HTMLElement);
      expect(icon?.className).toContain(`ic-${type}`);
      expect(icon?.className).toContain("size-5");
      expect(element.firstElementChild).toBe(icon);
    });
  });

  it("should let custom content own the full semantic inner markup", () => {
    const content = document.createElement("strong");
    content.textContent = "Custom semantic content";

    const element = renderToast(new SemanticToast({ type: "success", content }));

    expect(element.children).toHaveLength(1);
    expect(element.firstElementChild).toBe(content);
    expect(element.querySelector("i")).toBeNull();
  });

  it("should render success and info as status announcements", () => {
    expect(
      renderToast(new SemanticToast({ type: "success", message: "Saved successfully" })).getAttribute("role"),
    ).toBe("status");

    document.body.innerHTML = "";

    expect(renderToast(new SemanticToast({ type: "info", message: "Heads up" })).getAttribute("role")).toBe("status");
  });

  it("should render warning and error as alert announcements", () => {
    expect(renderToast(new SemanticToast({ type: "warning", message: "Check this" })).getAttribute("role")).toBe(
      "alert",
    );

    document.body.innerHTML = "";

    expect(renderToast(new SemanticToast({ type: "error", message: "Save failed" })).getAttribute("role")).toBe(
      "alert",
    );
  });

  it("should apply semantic preset classes and append className", () => {
    const element = renderToast(
      new SemanticToast({
        type: "success",
        message: "Saved successfully",
        className: "custom-semantic-toast",
      }),
    );

    expect(element.className).toContain("border-success");
    expect(element.className).toContain("bg-success-light");
    expect(element.className).toContain("text-success-dark");
    expect(element.className).toContain("custom-semantic-toast");
  });
});
