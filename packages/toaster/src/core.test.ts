import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createToaster, dialog as defaultDialog, toast as defaultToast } from ".";
import {
  animations,
  clickBackdrop,
  flushAnimations,
  installAnimateMock,
  installDialogMocks,
  mockBackdropRect,
} from "./test-utils";

beforeEach(() => {
  document.body.innerHTML = "";
  installAnimateMock();
  installDialogMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createToaster", () => {
  it("should return independent instances on each call", () => {
    const t1 = createToaster();
    const t2 = createToaster();
    expect(t1).not.toBe(t2);
    t1.destroy();
    t2.destroy();
  });

  it("should inject a per-instance style element for token overrides", () => {
    const toaster = createToaster({ tokens: { successBg: "rgb(0, 0, 255)" } });
    const styleElements = document.head.querySelectorAll("style[data-toast-token-owner]");
    expect(styleElements.length).toBeGreaterThan(0);
    const content = Array.from(styleElements)
      .map((el) =>
        Array.from((el as HTMLStyleElement).sheet?.cssRules ?? [])
          .map((rule) => rule.cssText)
          .join(""),
      )
      .join("");
    expect(content).toContain("--toast-color-success-bg: rgb(0, 0, 255);");
    toaster.destroy();
  });

  it("two instances should use separate style elements that do not clobber each other", () => {
    const t1 = createToaster({ tokens: { successBg: "red" } });
    const t2 = createToaster({ tokens: { successBg: "blue" } });
    const styles = document.head.querySelectorAll("style[data-toast-token-owner]");
    const texts = Array.from(styles).map((el) =>
      Array.from((el as HTMLStyleElement).sheet?.cssRules ?? [])
        .map((rule) => rule.cssText)
        .join(""),
    );
    expect(texts.some((t) => t.includes("red"))).toBe(true);
    expect(texts.some((t) => t.includes("blue"))).toBe(true);
    t1.destroy();
    t2.destroy();
  });
});

describe("deterministic destroy", () => {
  it("settles every visible toast's handle synchronously, before an exit animation would normally finish", async () => {
    const toaster = createToaster();
    const handle = toaster.success("Visible");
    flushAnimations();
    expect(handle.state).toBe("visible");

    toaster.destroy();

    expect(handle.state).toBe("hidden");
    // No pending animation left for a later flushAnimations() to complete.
    expect(animations.length).toBe(0);
    await expect(handle.settled).resolves.toBeUndefined();
  });

  it("settles a still-queued toast's handle synchronously too", () => {
    const toaster = createToaster({ maxVisible: 1, autoDismiss: false });
    toaster.info("First");
    const queued = toaster.info("Second");
    expect(queued.state).toBe("queued");

    toaster.destroy();
    expect(queued.state).toBe("hidden");
  });

  it("fires every lifecycle event for a toast destroyed while still queued, including onShow", () => {
    const toaster = createToaster({ maxVisible: 1, autoDismiss: false });
    toaster.info("First");
    const queued = toaster.info("Second");

    const seen: string[] = [];
    queued.onShow(() => seen.push("show"));
    queued.onHide(() => seen.push("hide"));
    queued.onHidden(() => seen.push("hidden"));

    toaster.destroy();
    expect(seen).toEqual(["show", "hide", "hidden"]);
  });

  it("cancels an in-flight entrance animation without firing shown or scheduling auto-dismiss", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const handle = toaster.success("Entering");
    // Deliberately not flushed: the entrance animation is still in flight.

    const onShown = vi.fn();
    handle.onShown(onShown);

    toaster.destroy();

    expect(handle.state).toBe("hidden");
    expect(onShown).not.toHaveBeenCalled();
    // If a timer had wrongly been scheduled, this would throw or hide()
    // would be invoked on an already-torn-down toast; neither happens.
    vi.advanceTimersByTime(5000);

    vi.useRealTimers();
  });
});

describe("configure", () => {
  it("should update token overrides at runtime", () => {
    const toaster = createToaster({ tokens: { successBg: "red" } });
    toaster.configure({ tokens: { successBg: "green" } });
    const styles = document.head.querySelectorAll("style[data-toast-token-owner]");
    const content = Array.from(styles)
      .map((el) =>
        Array.from((el as HTMLStyleElement).sheet?.cssRules ?? [])
          .map((rule) => rule.cssText)
          .join(""),
      )
      .join("");
    expect(content).toContain("green");
    toaster.destroy();
  });

  it("should propagate configure duration updates to new toasts", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    toaster.configure({ duration: 5000 });

    const handle = toaster.success("Config Test");
    flushAnimations();

    vi.advanceTimersByTime(1500);
    // If it used the old duration of 1000ms, it would be hidden by now.
    expect(handle.state).toBe("visible");

    vi.advanceTimersByTime(4000);
    // At 5500ms total, it should be hidden.
    flushAnimations();
    expect(handle.state).toBe("hidden");

    vi.useRealTimers();
    toaster.destroy();
  });
});

describe("instance-level className", () => {
  it("applies the config-level className to a toast with no per-call className", () => {
    const toaster = createToaster({ className: "glass" });
    toaster.success("Styled");

    const element = document.body.querySelector("[role='status']");
    expect(element?.className).toContain("glass");
    toaster.destroy();
  });

  it("appends the config-level className with the per-call className, config first", () => {
    const toaster = createToaster({ className: "glass" });
    toaster.success("Styled", { className: "urgent" });

    const element = document.body.querySelector<HTMLDivElement>("[role='status']");
    expect(element?.className).toContain("glass");
    expect(element?.className).toContain("urgent");
    expect(element!.className.indexOf("glass")).toBeLessThan(element!.className.indexOf("urgent"));
    toaster.destroy();
  });

  it("applies the config-level className to an interactive dialog", async () => {
    const toaster = createToaster({ className: "glass" });
    const handle = toaster.dialog.alert("Notice!");

    const dialog = document.body.querySelector("dialog");
    expect(dialog?.className).toContain("glass");

    handle.dismiss();
    await handle.settled;
    toaster.destroy();
  });

  it("appends the config-level className with a per-call dialog className", async () => {
    const toaster = createToaster({ className: "glass" });
    const handle = toaster.dialog.confirm("Delete?", { className: "danger-dialog" });

    const dialog = document.body.querySelector("dialog");
    expect(dialog?.className).toContain("glass");
    expect(dialog?.className).toContain("danger-dialog");

    handle.dismiss();
    await handle.settled;
    toaster.destroy();
  });

  it("keeps the config-level className after handle.update() replaces the per-call className", () => {
    const toaster = createToaster({ className: "glass" });
    const handle = toaster.success("Styled", { className: "class-one" });

    const element = document.body.querySelector("[role='status']");
    expect(element?.className).toContain("glass");
    expect(element?.className).toContain("class-one");

    handle.update({ className: "class-two" });
    expect(element?.className).toContain("glass");
    expect(element?.className).toContain("class-two");
    expect(element?.className).not.toContain("class-one");

    toaster.destroy();
  });
});

describe("callable toaster and neutral notifications", () => {
  it("dispatches default neutral notification when invoked as a function", () => {
    const toaster = createToaster();
    const handle = toaster("Default neutral message");
    expect(document.body.innerHTML).toContain("Default neutral message");
    const element = document.body.querySelector("[data-toast-message]");
    expect(element).not.toBeNull();
    const root = element?.closest(".coden-toast");
    expect(root?.classList.contains("coden-toast-default")).toBe(true);
    handle.dismiss();
    toaster.destroy();
  });

  it("singleton toast export dispatches directly", () => {
    const handle = defaultToast("Singleton message");
    expect(document.body.innerHTML).toContain("Singleton message");
    handle.dismiss();
  });

  it("singleton dialog export is defined and functional", () => {
    expect(defaultDialog).toBeDefined();
    expect(typeof defaultDialog.confirm).toBe("function");
    expect(typeof defaultDialog.prompt).toBe("function");
    expect(typeof defaultDialog.alert).toBe("function");
  });
});

describe("structured content and actions", () => {
  it("renders structured title and description", () => {
    const toaster = createToaster();
    const handle = toaster.success("Title text", {
      description: "Detailed description of what occurred",
    });

    const titleEl = document.body.querySelector("[data-toast-title]");
    const descEl = document.body.querySelector("[data-toast-description]");
    expect(titleEl?.textContent).toBe("Title text");
    expect(descEl?.textContent).toBe("Detailed description of what occurred");

    handle.dismiss();
    toaster.destroy();
  });

  it("renders inline action button and triggers onClick with handle", () => {
    const toaster = createToaster();
    const onClick = vi.fn();
    const handle = toaster.success("File deleted", {
      action: {
        label: "Undo",
        onClick,
      },
    });

    const actionBtn = document.body.querySelector<HTMLButtonElement>("[data-toast-action]");
    expect(actionBtn).not.toBeNull();
    expect(actionBtn?.textContent).toBe("Undo");

    actionBtn?.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick.mock.calls[0][1]).toBe(handle);
    // Action click must not automatically dismiss
    expect(handle.state).toBe("visible");

    handle.dismiss();
    toaster.destroy();
  });
});

describe("toast.promise", () => {
  it("manages promise success lifecycle with autoDismiss re-arming", async () => {
    vi.useFakeTimers();
    const toaster = createToaster();

    let resolvePromise!: (val: { name: string }) => void;
    const promise = new Promise<{ name: string }>((resolve) => {
      resolvePromise = resolve;
    });

    const toastPromise = toaster.promise(promise, {
      loading: "Saving...",
      success: (data) => `Saved ${data.name}!`,
      error: "Failed",
    });

    expect(document.body.textContent).toContain("Saving...");
    const loaderRoot = document.body.querySelector(".coden-toast");
    expect(loaderRoot?.classList.contains("coden-toast-default")).toBe(true);

    resolvePromise({ name: "Doc" });
    const result = await toastPromise;
    expect(result).toEqual({ name: "Doc" });

    flushAnimations();
    expect(document.body.textContent).toContain("Saved Doc!");
    const successRoot = document.body.querySelector(".coden-toast");
    expect(successRoot?.classList.contains("coden-toast-success")).toBe(true);

    // Re-armed auto-dismiss should dismiss it after default duration
    vi.advanceTimersByTime(5000);
    flushAnimations();
    expect(document.body.textContent).not.toContain("Saved Doc!");

    vi.useRealTimers();
    toaster.destroy();
  });

  it("manages promise error lifecycle and re-throws error", async () => {
    vi.useFakeTimers();
    const toaster = createToaster();

    let rejectPromise!: (err: Error) => void;
    const promise = new Promise<void>((_, reject) => {
      rejectPromise = reject;
    });

    const toastPromise = toaster.promise(promise, {
      loading: "Connecting...",
      success: "Connected",
      error: (err: unknown) => `Error: ${(err as Error).message}`,
    });

    expect(document.body.textContent).toContain("Connecting...");

    rejectPromise(new Error("Network timeout"));
    await expect(toastPromise).rejects.toThrow("Network timeout");

    flushAnimations();
    expect(document.body.textContent).toContain("Error: Network timeout");
    const errorRoot = document.body.querySelector(".coden-toast");
    expect(errorRoot?.classList.contains("coden-toast-error")).toBe(true);

    vi.advanceTimersByTime(5000);
    flushAnimations();
    expect(document.body.textContent).not.toContain("Error: Network timeout");

    vi.useRealTimers();
    toaster.destroy();
  });
});

describe("toaster semantic variants", () => {
  it("success() renders a success toast", () => {
    const toaster = createToaster();
    const h = toaster.success("Saved");
    expect(document.body.innerHTML).toContain("Saved");
    const el = document.body.querySelector(".coden-toast-success");
    expect(el).not.toBeNull();
    h.dismiss();
    toaster.destroy();
  });

  it("error() renders an error toast", () => {
    const toaster = createToaster();
    const h = toaster.error("Failed");
    expect(document.body.innerHTML).toContain("Failed");
    const el = document.body.querySelector(".coden-toast-error");
    expect(el).not.toBeNull();
    h.dismiss();
    toaster.destroy();
  });

  it("warning() renders a warning toast", () => {
    const toaster = createToaster();
    const h = toaster.warning("Warning");
    expect(document.body.innerHTML).toContain("Warning");
    const el = document.body.querySelector(".coden-toast-warning");
    expect(el).not.toBeNull();
    h.dismiss();
    toaster.destroy();
  });

  it("info() renders an info toast", () => {
    const toaster = createToaster();
    const h = toaster.info("Info");
    expect(document.body.innerHTML).toContain("Info");
    const el = document.body.querySelector(".coden-toast-info");
    expect(el).not.toBeNull();
    h.dismiss();
    toaster.destroy();
  });
});

describe("toaster.loading", () => {
  it("renders a loading toast and does not auto-dismiss", () => {
    const toaster = createToaster();
    const h = toaster.loading("Fetching…");
    expect(document.body.innerHTML).toContain("Fetching…");
    expect(h.state).toBe("visible");
    h.dismiss();
    toaster.destroy();
  });
});

describe("toaster.custom", () => {
  it("renders arbitrary DOM node content", () => {
    const toaster = createToaster();
    const node = document.createElement("span");
    node.textContent = "Custom!";
    const h = toaster.custom(node);
    expect(document.body.innerHTML).toContain("Custom!");
    h.dismiss();
    toaster.destroy();
  });

  it("sanitizes dangerous scripts and event attributes", () => {
    const toaster = createToaster();
    const h = toaster.custom('<span onclick="alert(1)">Custom!</span><script>alert(2)</script>');
    const html = document.body.innerHTML;
    expect(html).toContain("<span>Custom!</span>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script>");
    h.dismiss();
    toaster.destroy();
  });
});

describe("toaster.clear() and dismiss()", () => {
  it("clear() hides all active toasts", () => {
    const toaster = createToaster();
    toaster.success("T1");
    toaster.error("T2");
    toaster.loading("L1");

    toaster.clear();
    flushAnimations();

    expect(document.body.querySelector("[role='status'], [role='alert']")).toBeNull();
    toaster.destroy();
  });

  it("dismiss() without argument clears all active toasts", () => {
    const toaster = createToaster();
    toaster.success("T1");
    toaster.error("T2");

    toaster.dismiss();
    flushAnimations();

    expect(document.body.querySelector("[role='status'], [role='alert']")).toBeNull();
    toaster.destroy();
  });

  it("dismiss(handle) dismisses only the specific handle", () => {
    const toaster = createToaster();
    const h1 = toaster.success("T1");
    toaster.error("T2");

    toaster.dismiss(h1);
    flushAnimations();

    expect(document.body.textContent).not.toContain("T1");
    expect(document.body.textContent).toContain("T2");
    toaster.destroy();
  });
});

describe("destroy()", () => {
  it("removes toast containers from DOM", () => {
    const toaster = createToaster();
    toaster.success("Bye");
    expect(document.body.querySelector("[data-toast-container]")).not.toBeNull();

    toaster.destroy();
    expect(document.body.querySelector("[data-toast-container]")).toBeNull();
  });

  it("removes the instance style element", () => {
    const toaster = createToaster({ tokens: { successBg: "purple" } });
    const before = document.head.querySelectorAll("style[data-toast-token-owner]").length;
    toaster.destroy();
    const after = document.head.querySelectorAll("style[data-toast-token-owner]").length;
    expect(after).toBe(before - 1);
  });

  it("subsequent calls after destroy() throw", () => {
    const toaster = createToaster();
    toaster.destroy();
    expect(() => toaster.success("Ghost")).toThrow(/destroyed/);
    expect(() => toaster.clear()).toThrow(/destroyed/);
    expect(() => toaster.configure({})).toThrow(/destroyed/);
  });

  it("calling destroy() twice does not throw", () => {
    const toaster = createToaster();
    expect(() => {
      toaster.destroy();
      toaster.destroy();
    }).not.toThrow();
  });
});

describe("dialog.confirm", () => {
  it("resolves true when confirm button clicked", async () => {
    const toaster = createToaster();
    const handle = toaster.dialog.confirm("Delete?");

    const confirmBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();

    await expect(handle.result).resolves.toBe(true);
    toaster.destroy();
  });

  it("implements thenable PromiseLike directly", async () => {
    const toaster = createToaster();
    const confirmPromise = toaster.dialog.confirm("Are you sure?");

    const confirmBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    confirmBtn!.click();

    const result = await confirmPromise;
    expect(result).toBe(true);
    toaster.destroy();
  });

  it("resolves false and closes the dialog when dismissed programmatically", async () => {
    const toaster = createToaster();
    const handle = toaster.dialog.confirm("Delete?");

    const dialogEl = document.body.querySelector("dialog");
    expect(dialogEl?.open).toBe(true);

    handle.dismiss();

    await expect(handle.result).resolves.toBe(false);
    expect(dialogEl?.open).toBe(false);
    toaster.destroy();
  });
});

describe("dialog.prompt", () => {
  it("resolves with typed value when submitted", async () => {
    const toaster = createToaster();
    const handle = toaster.dialog.prompt("Your name?", { defaultValue: "Gustavo" });

    const input = document.body.querySelector<HTMLInputElement>("input");
    expect(input?.value).toBe("Gustavo");
    input!.value = "Antigravity";

    const submitBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    submitBtn!.click();

    await expect(handle.result).resolves.toBe("Antigravity");
    toaster.destroy();
  });

  it("resolves null when cancelled", async () => {
    const toaster = createToaster();
    const handle = toaster.dialog.prompt("Name?");

    const cancelBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-cancel");
    cancelBtn!.click();

    await expect(handle.result).resolves.toBeNull();
    toaster.destroy();
  });
});

describe("dialog.alert", () => {
  it("resolves void when OK clicked", async () => {
    const toaster = createToaster();
    const handle = toaster.dialog.alert("Notice!", { okLabel: "Got it" });

    const okBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    okBtn!.click();

    await expect(handle.result).resolves.toBeUndefined();
    toaster.destroy();
  });
});

describe("interactive shared behaviors", () => {
  it("should clean up event listeners on dialog reuse via AbortController", async () => {
    const toaster = createToaster();

    const handle1 = toaster.dialog.confirm("First confirm?");
    handle1.dismiss();
    await handle1.settled;

    const handle2 = toaster.dialog.confirm("Second confirm?");
    const cancelBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-cancel");
    cancelBtn!.click();

    await expect(handle2.result).resolves.toBe(false);
    toaster.destroy();
  });

  it("applies correct button semantic class depending on type option", async () => {
    const toaster = createToaster();

    const handleConfirm = toaster.dialog.confirm("Delete danger?", { type: "error" });
    const errorConfirmBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-error");
    expect(errorConfirmBtn).toBeTruthy();
    expect(errorConfirmBtn?.className).toContain("toast-dialog-btn-error");
    handleConfirm.dismiss();
    await handleConfirm.settled;

    const handlePrompt = toaster.dialog.prompt("Name secondary?", { type: "secondary" });
    const secondarySubmitBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-secondary");
    expect(secondarySubmitBtn).toBeTruthy();
    expect(secondarySubmitBtn?.className).toContain("toast-dialog-btn-secondary");
    handlePrompt.dismiss();
    await handlePrompt.settled;

    const handleAlert = toaster.dialog.alert("Success alert!", { type: "success" });
    const successOkBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-success");
    expect(successOkBtn).toBeTruthy();
    expect(successOkBtn?.className).toContain("toast-dialog-btn-success");
    handleAlert.dismiss();
    await handleAlert.settled;

    toaster.destroy();
  });
});

describe("container isolation", () => {
  it("toasters bound to different containers render inside their respective containers", () => {
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    document.body.append(c1, c2);

    const t1 = createToaster({ container: c1 });
    const t2 = createToaster({ container: c2 });

    t1.success("Toaster 1 Success");
    t2.success("Toaster 2 Success");

    expect(c1.innerHTML).toContain("Toaster 1 Success");
    expect(c1.innerHTML).not.toContain("Toaster 2 Success");
    expect(c2.innerHTML).toContain("Toaster 2 Success");
    expect(c2.innerHTML).not.toContain("Toaster 1 Success");

    t1.destroy();
    t2.destroy();
  });
});

describe("SSR compatibility", () => {
  it("can instantiate and configure without throwing when document is undefined", () => {
    const originalDoc = globalThis.document;
    // @ts-expect-error simulating SSR
    delete globalThis.document;

    expect(() => {
      const toaster = createToaster();
      toaster.destroy();
    }).not.toThrow();

    globalThis.document = originalDoc;
  });

  it("throws friendly error when calling show methods without DOM", () => {
    const originalDoc = globalThis.document;
    // @ts-expect-error simulating SSR
    delete globalThis.document;

    const toaster = createToaster();
    expect(() => toaster.success("SSR")).toThrow(/browser environment/);

    toaster.destroy();
    globalThis.document = originalDoc;
  });
});

describe("positioning and margins", () => {
  it("should support top-center, bottom-center, and center positions", () => {
    const toaster = createToaster();
    const h1 = toaster.success("Top Center", { position: "top-center" });
    const h2 = toaster.success("Bottom Center", { position: "bottom-center" });
    const h3 = toaster.success("Center", { position: "center" });

    const topCenterContainer = document.body.querySelector("[data-toast-container*='top-center']") as HTMLDivElement;
    const bottomCenterContainer = document.body.querySelector(
      "[data-toast-container*='bottom-center']",
    ) as HTMLDivElement;
    const centerContainer = document.body.querySelector(".coden-toast-stack-center") as HTMLDivElement;

    expect(topCenterContainer).not.toBeNull();
    expect(bottomCenterContainer).not.toBeNull();
    expect(centerContainer).not.toBeNull();

    expect(topCenterContainer.className).toContain("coden-toast-stack-top-center");
    expect(bottomCenterContainer.className).toContain("coden-toast-stack-bottom-center");
    expect(centerContainer.className).toContain("coden-toast-stack-center");

    h1.dismiss();
    h2.dismiss();
    h3.dismiss();
    toaster.destroy();
  });

  it("should apply margin as css variable on containers", () => {
    const toaster = createToaster({ margin: "24px" });
    toaster.success("Margin Test", { position: "top-left" });

    const container = document.body.querySelector("[data-toast-container*='top-left']") as HTMLDivElement;
    expect(container).not.toBeNull();
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("24px");
    expect(container.style.getPropertyValue("--toast-margin-y")).toBe("24px");

    toaster.destroy();
  });

  it("should apply granular margins (x and y) as css variables on containers", () => {
    const toaster = createToaster({ margin: { x: "15px", y: "30px" } });
    toaster.success("Granular Margin Test", { position: "top-left" });

    const container = document.body.querySelector("[data-toast-container*='top-left']") as HTMLDivElement;
    expect(container).not.toBeNull();
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("15px");
    expect(container.style.getPropertyValue("--toast-margin-y")).toBe("30px");

    toaster.destroy();
  });

  it("should support dynamic margin updates via configure()", () => {
    const toaster = createToaster({ margin: "10px" });
    toaster.success("Dynamic Margin", { position: "top-left" });

    const container = document.body.querySelector("[data-toast-container*='top-left']") as HTMLDivElement;
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("10px");

    toaster.configure({ margin: "40px" });
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("40px");
    expect(container.style.getPropertyValue("--toast-margin-y")).toBe("40px");

    toaster.destroy();
  });

  it("does not clear an explicit per-toast margin when an unrelated toast dispatches without one", () => {
    const toaster = createToaster();
    toaster.success("Custom margin", { position: "top-left", margin: "50px" });

    const container = document.body.querySelector("[data-toast-container*='top-left']") as HTMLDivElement;
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("50px");

    toaster.info("No opinion on margin", { position: "top-left" });

    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("50px");
    expect(container.style.getPropertyValue("--toast-margin-y")).toBe("50px");

    toaster.destroy();
  });
});

describe("stack insertion order for overflow scrolling", () => {
  it("inserts new toasts at the start of a top-anchored stack, not the end", () => {
    const toaster = createToaster({ position: "top-right", autoDismiss: false });
    toaster.success("First");
    toaster.success("Second");
    toaster.success("Third");

    const container = document.body.querySelector("[data-toast-container]")!;
    const texts = Array.from(container.children).map((child) => child.textContent);
    expect(texts).toEqual(["Third", "Second", "First"]);

    toaster.destroy();
  });

  it("appends new toasts to the end of a bottom-anchored stack", () => {
    const toaster = createToaster({ position: "bottom-right", autoDismiss: false });
    toaster.success("First");
    toaster.success("Second");
    toaster.success("Third");

    const container = document.body.querySelector("[data-toast-container]")!;
    const texts = Array.from(container.children).map((child) => child.textContent);
    expect(texts).toEqual(["First", "Second", "Third"]);

    toaster.destroy();
  });
});

describe("focus restoration on dismiss", () => {
  it("restores focus to whatever had it before the toast, if focus is still inside the toast at dismiss time", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const toaster = createToaster();
    const handle = toaster.success("Focus me", { dismissible: true });
    flushAnimations();

    const dismissButton = document.body.querySelector<HTMLButtonElement>(".coden-toast-dismiss")!;
    dismissButton.focus();
    expect(document.activeElement).toBe(dismissButton);

    handle.dismiss();
    flushAnimations();

    expect(document.activeElement).toBe(trigger);
    toaster.destroy();
    trigger.remove();
  });

  it("does not steal focus on dismiss when focus has already moved elsewhere", () => {
    const trigger = document.createElement("button");
    const elsewhere = document.createElement("button");
    document.body.append(trigger, elsewhere);
    trigger.focus();

    const toaster = createToaster();
    const handle = toaster.success("Not focused", { dismissible: true, autoDismiss: false });
    flushAnimations();

    elsewhere.focus();
    handle.dismiss();
    flushAnimations();

    expect(document.activeElement).toBe(elsewhere);
    toaster.destroy();
    trigger.remove();
    elsewhere.remove();
  });

  it("does not restore focus to a restore target that no longer exists", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const toaster = createToaster();
    const handle = toaster.success("Focus me", { dismissible: true });
    flushAnimations();

    const dismissButton = document.body.querySelector<HTMLButtonElement>(".coden-toast-dismiss")!;
    dismissButton.focus();
    trigger.remove();

    expect(() => handle.dismiss()).not.toThrow();
    flushAnimations();

    toaster.destroy();
  });
});

describe("Toast update", () => {
  it("should update message text dynamically", () => {
    const toaster = createToaster();
    const handle = toaster.success("Initial message");

    const element = document.body.querySelector("[role='status']");
    expect(element?.textContent).toContain("Initial message");

    handle.update({ message: "Updated message" });
    expect(element?.textContent).toContain("Updated message");
    expect(element?.textContent).not.toContain("Initial message");

    toaster.destroy();
  });

  it("should update token overrides dynamically", () => {
    const toaster = createToaster();
    const handle = toaster.success("Tokens test", {
      tokens: { successBg: "red" },
    });

    const element = document.body.querySelector<HTMLDivElement>("[role='status']");
    expect(element?.style.getPropertyValue("--toast-color-success-bg")).toBe("red");

    handle.update({ tokens: { successBg: "blue" } });
    expect(element?.style.getPropertyValue("--toast-color-success-bg")).toBe("blue");

    toaster.destroy();
  });

  it("should replace custom class name dynamically without accumulating", () => {
    const toaster = createToaster();
    const handle = toaster.success("Class test", {
      className: "class-one",
    });

    const element = document.body.querySelector("[role='status']");
    expect(element?.className).toContain("class-one");
    expect(element?.className).not.toContain("class-two");

    handle.update({ className: "class-two" });
    expect(element?.className).toContain("class-two");
    expect(element?.className).not.toContain("class-one");

    toaster.destroy();
  });

  it("completes a loading toast into a success toast: type, icon, and auto-dismiss together", () => {
    vi.useFakeTimers();
    const toaster = createToaster();
    const handle = toaster.loading("Uploading…");
    flushAnimations();

    const element = document.body.querySelector<HTMLDivElement>("[role='status']")!;
    expect(element.className).toContain("coden-toast-default");

    handle.update({ type: "success", message: "Uploaded", duration: 2000, autoDismiss: true });

    expect(element.className).toContain("coden-toast-success");
    expect(element.className).not.toContain("coden-toast-default");
    expect(element.textContent).toContain("Uploaded");
    expect(element.querySelector("svg.coden-toast-icon")).not.toBeNull();

    vi.advanceTimersByTime(2500);
    flushAnimations();
    expect(handle.state).toBe("hidden");

    vi.useRealTimers();
    toaster.destroy();
  });

  it("automatically re-arms autoDismiss when loader updates to semantic variant without explicit autoDismiss", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 3000 });
    const handle = toaster.loading("Processing...");
    flushAnimations();

    // Transition to success without passing autoDismiss
    handle.update({ type: "success", message: "Completed" });

    expect(handle.state).toBe("visible");
    vi.advanceTimersByTime(3500);
    flushAnimations();
    // Must auto-dismiss to prevent stuck loader
    expect(handle.state).toBe("hidden");

    vi.useRealTimers();
    toaster.destroy();
  });

  it("lets an explicit icon override the type's default icon in the same update() call", () => {
    const toaster = createToaster();
    const handle = toaster.success("Working");
    flushAnimations();
    const element = document.body.querySelector<HTMLDivElement>("[role='status']")!;

    handle.update({ type: "error", icon: "success" });

    expect(element.className).toContain("coden-toast-error");
    const icon = element.querySelector("svg.coden-toast-icon");
    expect(icon?.children.length).toBe(2);

    toaster.destroy();
  });

  it("removes the icon when updated to null", () => {
    const toaster = createToaster();
    const handle = toaster.success("Working");
    flushAnimations();
    const element = document.body.querySelector<HTMLDivElement>("[role='status']")!;
    expect(element.querySelector("svg.coden-toast-icon")).not.toBeNull();

    handle.update({ icon: null });
    expect(element.querySelector("svg.coden-toast-icon")).toBeNull();

    toaster.destroy();
  });

  it("replaces a message-based toast's content entirely via update({ content })", () => {
    const toaster = createToaster();
    const handle = toaster.success("Old message");
    flushAnimations();
    const element = document.body.querySelector<HTMLDivElement>("[role='status']")!;
    expect(element.textContent).toContain("Old message");

    const replacement = document.createElement("span");
    replacement.textContent = "Replaced";
    handle.update({ content: replacement });

    expect(element.textContent).toContain("Replaced");
    expect(element.textContent).not.toContain("Old message");
    expect(element.querySelector("[data-toast-message]")).toBeNull();

    toaster.destroy();
  });

  it("restarts the auto-dismiss countdown from a new duration", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 4000 });
    const handle = toaster.success("Countdown");
    flushAnimations();

    vi.advanceTimersByTime(1000);
    handle.update({ duration: 500 });
    vi.advanceTimersByTime(600);
    flushAnimations();
    expect(handle.state).toBe("hidden");

    vi.useRealTimers();
    toaster.destroy();
  });

  it("disables auto-dismiss on an already-visible toast via update()", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const handle = toaster.success("Stays");
    flushAnimations();

    handle.update({ autoDismiss: false });
    vi.advanceTimersByTime(5000);
    expect(handle.state).toBe("visible");

    vi.useRealTimers();
    toaster.destroy();
  });

  it("rejects an invalid duration passed to update()", () => {
    const toaster = createToaster();
    const handle = toaster.success("Duration test");
    flushAnimations();

    expect(() => handle.update({ duration: -1 })).toThrow(/duration/i);

    toaster.destroy();
  });

  it("rejects an unrecognized type passed to update()", () => {
    const toaster = createToaster();
    const handle = toaster.success("Type test");
    flushAnimations();

    expect(() => handle.update({ type: "not-a-type" as never })).toThrow(/type/i);

    toaster.destroy();
  });

  it("rejects update({ content }) that sanitization empties out entirely", () => {
    const toaster = createToaster();
    const handle = toaster.success("Original");
    flushAnimations();
    const element = document.body.querySelector<HTMLDivElement>("[role='status']")!;

    expect(() => handle.update({ content: "<script>alert(1)</script>" })).toThrow(/empty/);
    expect(element.textContent).toContain("Original");

    toaster.destroy();
  });
});

describe("background-tab auto-dismiss pause", () => {
  afterEach(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("pauses the auto-dismiss timer while the tab is hidden and resumes with the remaining duration", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const handle = toaster.success("Backgrounded");
    flushAnimations();

    vi.advanceTimersByTime(400);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    vi.advanceTimersByTime(5000);
    expect(handle.state).toBe("visible");

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    vi.advanceTimersByTime(500);
    expect(handle.state).toBe("visible");
    vi.advanceTimersByTime(200);
    flushAnimations();
    expect(handle.state).toBe("hidden");

    vi.useRealTimers();
    toaster.destroy();
  });

  it("does not let releasing hover resume the timer while the tab is still hidden", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    const handle = toaster.success("Hover then hide");
    flushAnimations();
    const element = document.body.querySelector<HTMLDivElement>("[role='status']")!;

    element.dispatchEvent(new MouseEvent("mouseenter"));
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    element.dispatchEvent(new MouseEvent("mouseleave"));

    vi.advanceTimersByTime(5000);
    expect(handle.state).toBe("visible");

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(1500);
    flushAnimations();
    expect(handle.state).toBe("hidden");

    vi.useRealTimers();
    toaster.destroy();
  });
});

describe("instance-level labels", () => {
  it("applies the configured dismiss button label to every toast", () => {
    const toaster = createToaster({ labels: { dismiss: "Fechar" }, dismissible: true });
    toaster.success("Localized");

    const button = document.body.querySelector(".coden-toast-dismiss");
    expect(button?.getAttribute("aria-label")).toBe("Fechar");

    toaster.destroy();
  });

  it("falls back to the built-in dismiss label when none is configured", () => {
    const toaster = createToaster({ dismissible: true });
    toaster.success("Default label");

    const button = document.body.querySelector(".coden-toast-dismiss");
    expect(button?.getAttribute("aria-label")).toBe("Dismiss toast");

    toaster.destroy();
  });

  it("applies instance-level dialog label defaults to confirm/prompt/alert", async () => {
    const toaster = createToaster({
      labels: { confirm: "Sim", cancel: "Não", submit: "Enviar", ok: "Entendi" },
    });

    const confirmHandle = toaster.dialog.confirm("Continue?");
    expect(document.body.querySelector(".toast-dialog-btn-primary")?.textContent).toBe("Sim");
    expect(document.body.querySelector(".toast-dialog-btn-cancel")?.textContent).toBe("Não");
    confirmHandle.dismiss();
    await confirmHandle.settled;

    const promptHandle = toaster.dialog.prompt("Name?");
    expect(document.body.querySelector(".toast-dialog-btn-primary")?.textContent).toBe("Enviar");
    expect(document.body.querySelector(".toast-dialog-btn-cancel")?.textContent).toBe("Não");
    promptHandle.dismiss();
    await promptHandle.settled;

    const alertHandle = toaster.dialog.alert("Done");
    expect(document.body.querySelector(".toast-dialog-btn-primary")?.textContent).toBe("Entendi");
    alertHandle.dismiss();
    await alertHandle.settled;

    toaster.destroy();
  });

  it("lets a per-call dialog label override the instance-level default", async () => {
    const toaster = createToaster({ labels: { confirm: "Sim" } });

    const handle = toaster.dialog.confirm("Continue?", { confirmLabel: "Proceed" });
    expect(document.body.querySelector(".toast-dialog-btn-primary")?.textContent).toBe("Proceed");
    handle.dismiss();
    await handle.settled;

    toaster.destroy();
  });
});

describe("Interactive Dialog Transition Queue", () => {
  it("should wait for transition to finish before showing the next queued modal", async () => {
    const toaster = createToaster();

    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const style = originalGetComputedStyle(el);
      if (el.tagName.toLowerCase() === "dialog") {
        return {
          ...style,
          transitionDuration: "0.2s",
        } as unknown as CSSStyleDeclaration;
      }
      return style;
    });

    toaster.dialog.alert("First alert");
    const handle2 = toaster.dialog.alert("Second alert");

    const dialogEl = document.body.querySelector("dialog");
    expect(dialogEl?.open).toBe(true);
    expect(document.body.innerHTML).toContain("First alert");
    expect(document.body.innerHTML).not.toContain("Second alert");

    const okBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    okBtn!.click();

    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.innerHTML).toContain("First alert");
    expect(document.body.innerHTML).not.toContain("Second alert");

    dialogEl!.dispatchEvent(new Event("transitionend"));

    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.innerHTML).toContain("Second alert");
    expect(document.body.innerHTML).not.toContain("First alert");

    const secondOkBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    secondOkBtn!.click();
    await handle2.settled;

    toaster.destroy();
  });

  it("should use dynamic fallback timeout based on transition duration", async () => {
    const toaster = createToaster();

    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const style = originalGetComputedStyle(el);
      if (el.tagName.toLowerCase() === "dialog") {
        return {
          ...style,
          transitionDuration: "0.1s",
          transitionDelay: "0.05s",
        } as unknown as CSSStyleDeclaration;
      }
      return style;
    });

    toaster.dialog.alert("First alert");
    const handle2 = toaster.dialog.alert("Second alert");

    const okBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    okBtn!.click();

    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.innerHTML).toContain("First alert");

    await new Promise((r) => setTimeout(r, 200));
    expect(document.body.innerHTML).toContain("Second alert");

    const secondOkBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    secondOkBtn!.click();
    await handle2.settled;

    toaster.destroy();
  });
});

describe("Interactive Dialog Backdrop Dismiss and Title Options", () => {
  it("should dismiss confirm modal on backdrop click by default", async () => {
    const toaster = createToaster();
    const handle = toaster.dialog.confirm("Confirm message");

    const dialogEl = document.body.querySelector("dialog")!;
    expect(dialogEl.open).toBe(true);

    mockBackdropRect(dialogEl);
    clickBackdrop(dialogEl);

    const result = await handle.result;
    expect(result).toBe(false);
    expect(dialogEl.open).toBe(false);

    toaster.destroy();
  });

  it("should dismiss prompt modal on backdrop click by default", async () => {
    const toaster = createToaster();
    const handle = toaster.dialog.prompt("Prompt message");

    const dialogEl = document.body.querySelector("dialog")!;
    expect(dialogEl.open).toBe(true);

    mockBackdropRect(dialogEl);
    clickBackdrop(dialogEl);

    const result = await handle.result;
    expect(result).toBeNull();
    expect(dialogEl.open).toBe(false);

    toaster.destroy();
  });

  it("should dismiss alert modal on backdrop click by default", async () => {
    const toaster = createToaster();
    const handle = toaster.dialog.alert("Alert message");

    const dialogEl = document.body.querySelector("dialog")!;
    expect(dialogEl.open).toBe(true);

    mockBackdropRect(dialogEl);
    clickBackdrop(dialogEl);

    await handle.result;
    expect(dialogEl.open).toBe(false);

    toaster.destroy();
  });

  it("should NOT dismiss confirm modal on backdrop click if backdropDismiss: false is passed", async () => {
    const toaster = createToaster();
    const handleConfirm = toaster.dialog.confirm("Confirm message", { backdropDismiss: false });
    const dialogConfirm = document.body.querySelector("dialog")!;
    mockBackdropRect(dialogConfirm);
    clickBackdrop(dialogConfirm);
    expect(dialogConfirm.open).toBe(true);
    handleConfirm.dismiss();
    await handleConfirm.settled;
    toaster.destroy();
  });

  it("should NOT dismiss prompt modal on backdrop click if backdropDismiss: false is passed", async () => {
    const toaster = createToaster();
    const handlePrompt = toaster.dialog.prompt("Prompt message", { backdropDismiss: false });
    const dialogPrompt = document.body.querySelector("dialog")!;
    mockBackdropRect(dialogPrompt);
    clickBackdrop(dialogPrompt);
    expect(dialogPrompt.open).toBe(true);
    handlePrompt.dismiss();
    await handlePrompt.settled;
    toaster.destroy();
  });

  it("should render title in interactive dialogs when provided", async () => {
    const toaster = createToaster();

    const h1 = toaster.dialog.confirm("Message 1", { title: "Title 1" });
    let titleEl = document.body.querySelector(".toast-dialog-title");
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe("Title 1");
    h1.dismiss();
    await h1.settled;

    const h2 = toaster.dialog.prompt("Message 2", { title: "Title 2" });
    titleEl = document.body.querySelector(".toast-dialog-title");
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe("Title 2");
    h2.dismiss();
    await h2.settled;

    const h3 = toaster.dialog.alert("Message 3", { title: "Title 3" });
    titleEl = document.body.querySelector(".toast-dialog-title");
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe("Title 3");
    h3.dismiss();

    toaster.destroy();
  });
});

describe("WCAG Accessibility", () => {
  it("should pause auto-dismiss on hover and resume on leave", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 2000 });
    const handle = toaster.success("Hover Test");
    flushAnimations();

    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    expect(element).toBeTruthy();

    vi.advanceTimersByTime(1000);
    expect(handle.state).toBe("visible");

    element.dispatchEvent(new MouseEvent("mouseenter"));

    vi.advanceTimersByTime(2000);
    expect(handle.state).toBe("visible");

    element.dispatchEvent(new MouseEvent("mouseleave"));

    vi.advanceTimersByTime(2500);
    flushAnimations();
    expect(handle.state).toBe("hidden");

    vi.useRealTimers();
    toaster.destroy();
  });

  it("should pause auto-dismiss on focus and resume on blur", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 2000 });
    const handle = toaster.success("Focus Test");
    flushAnimations();

    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    expect(element).toBeTruthy();

    element.dispatchEvent(new FocusEvent("focusin"));

    vi.advanceTimersByTime(3000);
    expect(handle.state).toBe("visible");

    element.dispatchEvent(new FocusEvent("focusout"));

    vi.advanceTimersByTime(2500);
    flushAnimations();
    expect(handle.state).toBe("hidden");

    vi.useRealTimers();
    toaster.destroy();
  });
});
