import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createToaster } from ".";
import { flushAnimations, installAnimateMock } from "./test-utils";

function region(politeness: "polite" | "assertive"): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-toast-announcer="${politeness}"]`);
}

function lines(politeness: "polite" | "assertive"): string[] {
  return Array.from(region(politeness)?.children ?? []).map((line) => line.textContent ?? "");
}

beforeEach(() => {
  document.body.innerHTML = "";
  installAnimateMock();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("screen reader announcements", () => {
  it("does not make the toast element itself a live region", () => {
    const toaster = createToaster();
    toaster.success("Saved");
    const element = document.body.querySelector(".coden-toast")!;
    expect(element.hasAttribute("role")).toBe(false);
    expect(element.hasAttribute("aria-live")).toBe(false);
    toaster.destroy();
  });

  it("adds a new region empty and fills it in a later task", () => {
    const toaster = createToaster();
    toaster.success("Saved");

    const polite = region("polite")!;
    expect(polite.getAttribute("aria-live")).toBe("polite");
    expect(polite.textContent).toBe("");

    vi.advanceTimersByTime(100);
    expect(lines("polite")).toEqual(["Saved"]);
    toaster.destroy();
  });

  it("announces status toasts politely and alert toasts assertively", () => {
    const toaster = createToaster();
    toaster.info("Synced");
    toaster.error("Upload failed");
    vi.advanceTimersByTime(100);

    expect(lines("polite")).toEqual(["Synced"]);
    expect(lines("assertive")).toEqual(["Upload failed"]);
    expect(region("assertive")!.getAttribute("aria-live")).toBe("assertive");
    toaster.destroy();
  });

  it("follows a role override", () => {
    const toaster = createToaster();
    toaster.error("Recoverable", { role: "status" });
    vi.advanceTimersByTime(100);

    expect(lines("polite")).toEqual(["Recoverable"]);
    expect(lines("assertive")).toEqual([]);
    toaster.destroy();
  });

  it("keeps every toast dispatched before the region is ready", () => {
    const toaster = createToaster();
    toaster.success("First");
    toaster.success("Second");
    vi.advanceTimersByTime(100);

    expect(lines("polite")).toEqual(["First", "Second"]);
    toaster.destroy();
  });

  it("announces at once into a region that already exists", () => {
    const toaster = createToaster();
    toaster.success("First");
    vi.advanceTimersByTime(100);

    toaster.success("Second");
    expect(lines("polite")).toEqual(["First", "Second"]);
    toaster.destroy();
  });

  it("separates a title from its description", () => {
    const toaster = createToaster();
    toaster.success({ title: "Saved", description: "All 12 files" });
    vi.advanceTimersByTime(100);

    expect(lines("polite")).toEqual(["Saved All 12 files"]);
    toaster.destroy();
  });

  it("announces the text of custom content", () => {
    const toaster = createToaster();
    const content = document.createElement("p");
    content.innerHTML = "Custom <strong>body</strong>";
    toaster.custom({ content, dismissible: true });
    vi.advanceTimersByTime(100);

    expect(lines("polite")).toEqual(["Custom body"]);
    toaster.destroy();
  });

  it("leaves buttons out of custom content and keeps its direct text", () => {
    const toaster = createToaster();
    const actions = document.createElement("div");
    const button = document.createElement("button");
    button.textContent = "Review";
    actions.append("Changes", button);
    const content = document.createDocumentFragment();
    content.append("3 files", actions);
    toaster.custom({ content, dismissible: true });
    vi.advanceTimersByTime(100);

    expect(lines("polite")).toEqual(["3 files Changes"]);
    toaster.destroy();
  });

  it("announces a settled promise in the region its outcome calls for", async () => {
    const toaster = createToaster();
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_, rejectPromise) => {
      reject = rejectPromise;
    });
    const result = toaster.promise(pending, {
      loading: "Saving",
      success: "Saved",
      error: "Save failed",
    });
    vi.advanceTimersByTime(100);
    expect(lines("polite")).toEqual(["Saving"]);

    reject(new Error("offline"));
    await expect(result).rejects.toThrow("offline");
    vi.advanceTimersByTime(100);
    expect(lines("assertive")).toEqual(["Save failed"]);
    toaster.destroy();
  });

  it("does not announce an update that leaves the text unchanged", () => {
    const toaster = createToaster();
    const handle = toaster.success("Saved");
    vi.advanceTimersByTime(100);

    handle.update({ className: "soft" });
    expect(lines("polite")).toEqual(["Saved"]);
    toaster.destroy();
  });

  it("clears announced lines after a while", () => {
    const toaster = createToaster();
    toaster.success("Saved", { autoDismiss: false });
    vi.advanceTimersByTime(100);
    expect(lines("polite")).toEqual(["Saved"]);

    vi.advanceTimersByTime(7000);
    expect(lines("polite")).toEqual([]);
    toaster.destroy();
  });

  it("removes its regions and drops pending text on destroy", () => {
    const toaster = createToaster();
    toaster.success("Saved");
    toaster.destroy();
    flushAnimations();
    vi.advanceTimersByTime(100);

    expect(region("polite")).toBeNull();
    expect(region("assertive")).toBeNull();
  });

  it("keeps each instance's regions apart", () => {
    const first = createToaster();
    const second = createToaster();
    first.success("From first");
    second.success("From second");
    vi.advanceTimersByTime(100);

    const regions = document.body.querySelectorAll('[data-toast-announcer="polite"]');
    expect(Array.from(regions, (node) => node.textContent)).toEqual(["From first", "From second"]);
    first.destroy();
    second.destroy();
  });
});

describe("actionable toasts", () => {
  it("announces the action label after the toast's text", () => {
    const toaster = createToaster();
    toaster.success("Deleted", { action: { label: "Undo", onClick: () => {} } });
    toaster.info("Saved.", { action: { label: "View", onClick: () => {} } });
    vi.advanceTimersByTime(100);

    expect(lines("polite")).toEqual(["Deleted. Undo", "Saved. View"]);
    toaster.destroy();
  });

  it("labels each stack as a notifications region", () => {
    const toaster = createToaster();
    toaster.success("Saved");
    const stack = document.body.querySelector("[data-toast-container]")!;
    expect(stack.getAttribute("role")).toBe("region");
    expect(stack.getAttribute("aria-label")).toBe("Notifications");
    toaster.destroy();
  });

  it("localizes the region label", () => {
    const toaster = createToaster({ labels: { notifications: "Notificações" } });
    toaster.success("Salvo");
    const stack = document.body.querySelector("[data-toast-container]")!;
    expect(stack.getAttribute("aria-label")).toBe("Notificações");

    toaster.configure({ labels: { notifications: "Avisos" } });
    expect(stack.getAttribute("aria-label")).toBe("Avisos");
    toaster.destroy();
  });
});
