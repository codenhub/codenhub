import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createToaster } from ".";
import { createDialogs } from "./dialog";
import { flushAnimations, installAnimateMock, installDialogMocks } from "./test-utils";

// While a modal dialog is open, everything outside it is inert, so the
// instance's toasts live inside its dialog for that time.

function stackOf(text: string): HTMLElement {
  const toast = Array.from(document.querySelectorAll<HTMLElement>(".toaster-toast")).find((element) =>
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
    const dialogs = createDialogs();
    void dialogs.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;

    toaster.success("Saved");
    flushAnimations();

    expect(stackOf("Saved").parentElement).toBe(dialog);
    dialogs.destroy();
    toaster.destroy();
  });

  it("moves toasts already showing into the dialog, and back out when it closes", async () => {
    const toaster = createToaster();
    const dialogs = createDialogs();
    toaster.success("Saved", { autoDismiss: false });
    flushAnimations();
    expect(stackOf("Saved").parentElement).toBe(document.body);

    const handle = dialogs.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;
    expect(stackOf("Saved").parentElement).toBe(dialog);

    handle.dismiss();
    await handle.settled;
    expect(stackOf("Saved").parentElement).toBe(document.body);
    expect(document.querySelectorAll("[data-toast-container]")).toHaveLength(1);
    dialogs.destroy();
    toaster.destroy();
  });

  it("keeps one stack per position when a toast arrives while the dialog is open", async () => {
    const toaster = createToaster();
    const dialogs = createDialogs();
    toaster.success("Before", { autoDismiss: false });
    flushAnimations();
    const handle = dialogs.alert("Heads up");

    toaster.success("During", { autoDismiss: false });
    flushAnimations();
    expect(stackOf("During")).toBe(stackOf("Before"));

    handle.dismiss();
    await handle.settled;
    expect(stackOf("During").parentElement).toBe(document.body);
    expect(document.querySelectorAll("[data-toast-container]")).toHaveLength(1);
    dialogs.destroy();
    toaster.destroy();
  });

  it("announces a toast through a live region inside the open dialog", () => {
    vi.useFakeTimers();
    const toaster = createToaster();
    const dialogs = createDialogs();
    void dialogs.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;

    toaster.error("Upload failed");
    vi.advanceTimersByTime(100);

    const region = dialog.querySelector('[data-toast-announcer="assertive"]');
    expect(region?.textContent).toBe("Upload failed");
    dialogs.destroy();
    toaster.destroy();
  });

  it("re-announces text still waiting when the dialog closes before its region is ready", async () => {
    vi.useFakeTimers();
    const toaster = createToaster();
    const dialogs = createDialogs();
    const handle = dialogs.confirm("Delete?");
    toaster.error("Upload failed");

    handle.dismiss();
    await handle.settled;
    vi.advanceTimersByTime(200);

    const region = document.body.querySelector(':scope > [data-toast-announcer="assertive"]');
    expect(region?.textContent).toBe("Upload failed");
    dialogs.destroy();
    toaster.destroy();
  });

  it("announces in the dialog a toast whose region was not ready when the dialog opened", () => {
    vi.useFakeTimers();
    const toaster = createToaster();
    const dialogs = createDialogs();
    toaster.error("Upload failed");
    void dialogs.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;
    vi.advanceTimersByTime(200);

    const region = dialog.querySelector('[data-toast-announcer="assertive"]');
    expect(region?.textContent).toBe("Upload failed");
    dialogs.destroy();
    toaster.destroy();
  });

  it("announces outside the dialog when the region is ready during its exit transition", () => {
    vi.useFakeTimers();
    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = originalGetComputedStyle(element);
      return element.tagName === "DIALOG"
        ? ({ ...style, transitionDuration: "0.2s" } as unknown as CSSStyleDeclaration)
        : style;
    });
    const toaster = createToaster();
    const dialogs = createDialogs();
    const handle = dialogs.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;
    toaster.error("Upload failed");

    // The dialog is closed, and no longer modal, as soon as its exit transition starts.
    handle.dismiss();
    vi.advanceTimersByTime(100);
    expect(dialog.querySelector('[data-toast-announcer="assertive"]')?.textContent).toBe("");

    vi.advanceTimersByTime(500);
    const regions = document.querySelectorAll('[data-toast-announcer="assertive"]');
    expect(Array.from(regions, (region) => [region.parentElement, region.textContent])).toEqual([
      [document.body, "Upload failed"],
    ]);
    dialogs.destroy();
    toaster.destroy();
  });

  it("moves every toaster's toasts in the same parent into the dialog", () => {
    const first = createToaster();
    const second = createToaster();
    const dialogs = createDialogs();
    void dialogs.confirm("Delete?");
    const dialog = document.querySelector("dialog")!;

    first.success("Mine");
    second.success("Elsewhere");
    flushAnimations();

    expect(stackOf("Mine").parentElement).toBe(dialog);
    expect(stackOf("Elsewhere").parentElement).toBe(dialog);
    dialogs.destroy();
    first.destroy();
    second.destroy();
  });

  it("hands toasts back through nested dialogs from two instances", async () => {
    const toaster = createToaster();
    const outer = createDialogs();
    const inner = createDialogs();
    const outerHandle = outer.confirm("Outer?");
    const outerDialog = document.querySelector("dialog")!;
    toaster.success("Saved", { autoDismiss: false });
    flushAnimations();
    expect(stackOf("Saved").parentElement).toBe(outerDialog);

    const innerHandle = inner.alert("Inner");
    const innerDialog = Array.from(document.querySelectorAll("dialog")).find((d) => d !== outerDialog)!;
    expect(stackOf("Saved").parentElement).toBe(innerDialog);

    innerHandle.dismiss();
    await innerHandle;
    flushAnimations();
    expect(stackOf("Saved").parentElement).toBe(outerDialog);

    outerHandle.dismiss();
    await outerHandle;
    flushAnimations();
    expect(stackOf("Saved").parentElement).toBe(document.body);
    inner.destroy();
    outer.destroy();
    toaster.destroy();
  });

  it("removes the moved stacks when the toaster is destroyed with the dialog open", async () => {
    const toaster = createToaster();
    const dialogs = createDialogs();
    toaster.success("Saved", { autoDismiss: false });
    const handle = dialogs.confirm("Delete?");

    dialogs.destroy();
    toaster.destroy();
    expect(await handle).toBe(false);
    expect(document.querySelector("[data-toast-container]")).toBeNull();
    expect(document.querySelector("dialog")).toBeNull();
  });
});
