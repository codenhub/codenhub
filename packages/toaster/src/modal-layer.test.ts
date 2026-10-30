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
