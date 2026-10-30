import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createToaster } from ".";
import { flushAnimations, installAnimateMock, installDialogMocks } from "./test-utils";

// While a modal dialog is open, everything outside it is inert, so the
// instance's toasts live inside its dialog for that time.

function stackOf(text: string): HTMLElement {
  const toast = Array.from(document.querySelectorAll<HTMLElement>(".coden-toast")).find((element) =>
    element.textContent?.includes(text),
  )!;
  return toast.closest<HTMLElement>("[data-toast-container]")!;
}

beforeEach(() => {
  document.body.innerHTML = "";
  installAnimateMock();
  installDialogMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("toasts while a dialog is open", () => {
  it("shows a toast dispatched while the dialog is open inside the dialog", () => {
    const toaster = createToaster();
    void toaster.dialog.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;

    toaster.success("Saved");
    flushAnimations();

    expect(stackOf("Saved").parentElement).toBe(dialog);
    toaster.destroy();
  });

  it("moves toasts already showing into the dialog, and back out when it closes", async () => {
    const toaster = createToaster();
    toaster.success("Saved", { autoDismiss: false });
    flushAnimations();
    expect(stackOf("Saved").parentElement).toBe(document.body);

    const handle = toaster.dialog.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;
    expect(stackOf("Saved").parentElement).toBe(dialog);

    handle.dismiss();
    await handle.settled;
    expect(stackOf("Saved").parentElement).toBe(document.body);
    expect(document.querySelectorAll("[data-toast-container]")).toHaveLength(1);
    toaster.destroy();
  });

  it("keeps one stack per position when a toast arrives while the dialog is open", async () => {
    const toaster = createToaster();
    toaster.success("Before", { autoDismiss: false });
    flushAnimations();
    const handle = toaster.dialog.alert("Heads up");

    toaster.success("During", { autoDismiss: false });
    flushAnimations();
    expect(stackOf("During")).toBe(stackOf("Before"));

    handle.dismiss();
    await handle.settled;
    expect(stackOf("During").parentElement).toBe(document.body);
    expect(document.querySelectorAll("[data-toast-container]")).toHaveLength(1);
    toaster.destroy();
  });

  it("announces a toast through a live region inside the open dialog", () => {
    vi.useFakeTimers();
    const toaster = createToaster();
    void toaster.dialog.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;

    toaster.error("Upload failed");
    vi.advanceTimersByTime(100);

    const region = dialog.querySelector('[data-toast-announcer="assertive"]');
    expect(region?.textContent).toBe("Upload failed");
    toaster.destroy();
  });

  it("re-announces text still waiting when the dialog closes before its region is ready", async () => {
    vi.useFakeTimers();
    const toaster = createToaster();
    const handle = toaster.dialog.confirm("Delete?");
    toaster.error("Upload failed");

    handle.dismiss();
    await handle.settled;
    vi.advanceTimersByTime(200);

    const region = document.body.querySelector(':scope > [data-toast-announcer="assertive"]');
    expect(region?.textContent).toBe("Upload failed");
    toaster.destroy();
  });

  it("announces in the dialog a toast whose region was not ready when the dialog opened", () => {
    vi.useFakeTimers();
    const toaster = createToaster();
    toaster.error("Upload failed");
    void toaster.dialog.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;
    vi.advanceTimersByTime(200);

    const region = dialog.querySelector('[data-toast-announcer="assertive"]');
    expect(region?.textContent).toBe("Upload failed");
    toaster.destroy();
  });

  it("announces in the closing dialog when the region is ready during its exit transition", () => {
    vi.useFakeTimers();
    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = originalGetComputedStyle(element);
      return element.tagName === "DIALOG"
        ? ({ ...style, transitionDuration: "0.2s" } as unknown as CSSStyleDeclaration)
        : style;
    });
    const toaster = createToaster();
    const handle = toaster.dialog.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;
    toaster.error("Upload failed");

    // The dialog is still modal while it closes, so the rest of the page is still inert.
    handle.dismiss();
    vi.advanceTimersByTime(100);
    expect(dialog.querySelector('[data-toast-announcer="assertive"]')?.textContent).toBe("Upload failed");

    // Cleanup clears the dialog; the line is not announced a second time.
    vi.advanceTimersByTime(500);
    expect(dialog.querySelector("[data-toast-announcer]")).toBeNull();
    expect(document.body.querySelector('[data-toast-announcer="assertive"]')).toBeNull();
    toaster.destroy();
  });

  it("leaves another instance's toasts outside the dialog", () => {
    const first = createToaster();
    const second = createToaster();
    void first.dialog.confirm("Delete?");

    second.success("Elsewhere");
    flushAnimations();

    expect(stackOf("Elsewhere").parentElement).toBe(document.body);
    first.destroy();
    second.destroy();
  });

  it("removes the moved stacks when the toaster is destroyed with the dialog open", async () => {
    const toaster = createToaster();
    toaster.success("Saved", { autoDismiss: false });
    const handle = toaster.dialog.confirm("Delete?");

    toaster.destroy();
    expect(await handle).toBe(false);
    expect(document.querySelector("[data-toast-container]")).toBeNull();
    expect(document.querySelector("dialog")).toBeNull();
  });
});
