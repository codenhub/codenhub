import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createToaster } from "./core";
import { animations, flushAnimations, installAnimateMock, installDialogMocks } from "./test-utils";

beforeEach(() => {
  document.body.innerHTML = "";
  installAnimateMock();
  installDialogMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("native dialog close reconciliation", () => {
  it("settles the handle and advances the queue when the dialog is closed directly", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.alert("Direct close");
    const dialog = document.body.querySelector("dialog")!;

    dialog.close();

    await expect(handle.result).resolves.toBeUndefined();
    expect(handle.state).toBe("hidden");
    toaster.destroy();
  });

  it("advances a queued modal after the active one is closed directly", async () => {
    const toaster = createToaster();
    const first = toaster.interactive.alert("First");
    const second = toaster.interactive.alert("Second");

    const dialog = document.body.querySelector("dialog")!;
    dialog.close();
    await first.result;

    expect(document.body.textContent).toContain("Second");
    second.dismiss();
    await second.settled;
    toaster.destroy();
  });

  it("does not double-complete when the controller's own dismiss triggers the native close event", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.confirm("Owned close");

    handle.dismiss();

    await expect(handle.result).resolves.toBe(false);
    expect(handle.state).toBe("hidden");
    toaster.destroy();
  });
});

describe("entrance animation cancellation", () => {
  it("still notifies shown and schedules auto-dismiss when the entrance animation is canceled", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const handle = toaster.semantic.success("Entering");

    // Cancel the entrance animation instead of letting it finish naturally.
    animations[0]?.oncancel?.();
    expect(handle.state).toBe("visible");

    vi.advanceTimersByTime(1500);
    flushAnimations();

    expect(handle.state).toBe("hidden");
    vi.useRealTimers();
    toaster.destroy();
  });
});

describe("modal transition completion", () => {
  it("waits for every configured transition property before reusing the dialog", async () => {
    const toaster = createToaster();
    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const style = originalGetComputedStyle(el);
      if (el.tagName.toLowerCase() === "dialog") {
        return {
          ...style,
          transitionDuration: "0.05s",
          transitionProperty: "opacity, transform, overlay",
        } as unknown as CSSStyleDeclaration;
      }
      return style;
    });

    toaster.interactive.alert("First alert");
    const handle2 = toaster.interactive.alert("Second alert");

    const dialog = document.body.querySelector("dialog")!;
    const okBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary")!;
    okBtn.click();

    // The fastest property finishing alone must not be enough to reuse the
    // dialog while the other two configured properties are still running.
    dialog.dispatchEvent(new Event("transitionend"));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.innerHTML).toContain("First alert");
    expect(document.body.innerHTML).not.toContain("Second alert");

    dialog.dispatchEvent(new Event("transitionend"));
    dialog.dispatchEvent(new Event("transitionend"));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.innerHTML).toContain("Second alert");

    const secondOkBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary")!;
    secondOkBtn.click();
    await handle2.settled;
    toaster.destroy();
  });
});
