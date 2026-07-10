import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createToaster } from "./core";

interface MockAnimation {
  target: HTMLDivElement;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  finished: Promise<void>;
}

let animations: MockAnimation[] = [];

function flushAnimations(): void {
  animations.forEach((anim) => {
    if (anim.onfinish) {
      anim.onfinish();
    }
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
  animations = [];

  HTMLElement.prototype.animate = vi.fn().mockImplementation(function (
    this: HTMLDivElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation: MockAnimation = {
      target: this,
      keyframes,
      options,
      onfinish: null,
      oncancel: null,
      finished: Promise.resolve(),
    };
    animations.push(animation);
    return animation as unknown as Animation;
  });

  // jsdom does not implement HTMLDialogElement.showModal / close
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = vi.fn().mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = vi.fn().mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe("createToaster", () => {
  it("should return independent instances on each call", () => {
    const t1 = createToaster();
    const t2 = createToaster();
    expect(t1).not.toBe(t2);
    t1.destroy();
    t2.destroy();
  });

  it("should inject a per-instance style element for token overrides", () => {
    const toaster = createToaster({ tokens: { success: "rgb(0, 0, 255)" } });
    const styleElements = document.head.querySelectorAll("style[id^='toast-instance-']");
    expect(styleElements.length).toBeGreaterThan(0);
    const content = Array.from(styleElements)
      .map((el) => el.textContent)
      .join("");
    expect(content).toContain("--toast-color-success: rgb(0, 0, 255);");
    toaster.destroy();
  });

  it("two instances should use separate style elements that do not clobber each other", () => {
    const t1 = createToaster({ tokens: { success: "red" } });
    const t2 = createToaster({ tokens: { success: "blue" } });
    const styles = document.head.querySelectorAll("style[id^='toast-instance-']");
    const texts = Array.from(styles).map((el) => el.textContent ?? "");
    expect(texts.some((t) => t.includes("red"))).toBe(true);
    expect(texts.some((t) => t.includes("blue"))).toBe(true);
    t1.destroy();
    t2.destroy();
  });
});

// ---------------------------------------------------------------------------
// configure()
// ---------------------------------------------------------------------------

describe("configure", () => {
  it("should update token overrides at runtime", () => {
    const toaster = createToaster({ tokens: { success: "red" } });
    toaster.configure({ tokens: { success: "green" } });
    const styles = document.head.querySelectorAll("style[id^='toast-instance-']");
    const content = Array.from(styles)
      .map((el) => el.textContent)
      .join("");
    expect(content).toContain("green");
    toaster.destroy();
  });

  it("should propagate configure duration updates to new toasts", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 1000 });
    toaster.configure({ duration: 5000 });

    const handle = toaster.semantic.success("Config Test");
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

// ---------------------------------------------------------------------------
// Category managers
// ---------------------------------------------------------------------------

describe("toaster.semantic", () => {
  it("show() renders a toast and returns a handle", () => {
    const toaster = createToaster();
    const h = toaster.semantic.show({ message: "Hello", type: "success" });
    expect(document.body.innerHTML).toContain("Hello");
    h.dismiss();
    toaster.destroy();
  });

  it("clear() hides only semantic toasts", () => {
    const toaster = createToaster();
    toaster.semantic.success("S1");
    toaster.semantic.error("S2");
    toaster.loading.show({ message: "L1" });

    toaster.semantic.clear();
    flushAnimations();

    expect(document.body.innerHTML).not.toContain("S1");
    expect(document.body.innerHTML).not.toContain("S2");
    expect(document.body.innerHTML).toContain("L1");
    toaster.destroy();
  });
});

describe("toaster.loading", () => {
  it("show() renders a loading toast and does not auto-dismiss", () => {
    const toaster = createToaster();
    const h = toaster.loading.show({ message: "Fetching…" });
    expect(document.body.innerHTML).toContain("Fetching…");
    expect(h.state).toBe("visible");
    h.dismiss();
    toaster.destroy();
  });

  it("clear() hides only loading toasts", () => {
    const toaster = createToaster();
    toaster.semantic.success("Keep me");
    toaster.loading.show({ message: "Remove me" });

    toaster.loading.clear();
    flushAnimations();

    expect(document.body.innerHTML).toContain("Keep me");
    expect(document.body.innerHTML).not.toContain("Remove me");
    toaster.destroy();
  });
});

describe("toaster.custom", () => {
  it("show() renders arbitrary content", () => {
    const toaster = createToaster();
    const node = document.createElement("span");
    node.textContent = "Custom!";
    const h = toaster.custom.show({ content: node });
    expect(document.body.innerHTML).toContain("Custom!");
    h.dismiss();
    toaster.destroy();
  });

  it("show() sanitizes dangerous scripts and event attributes", () => {
    const toaster = createToaster();
    const h = toaster.custom.show({
      content: '<span onclick="alert(1)">Custom!</span><script>alert(2)</script>',
    });
    const html = document.body.innerHTML;
    expect(html).toContain("<span>Custom!</span>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script>");
    h.dismiss();
    toaster.destroy();
  });
});

// ---------------------------------------------------------------------------
// Global clear()
// ---------------------------------------------------------------------------

describe("toaster.clear()", () => {
  it("hides all non-interactive toasts", () => {
    const toaster = createToaster();
    toaster.semantic.success("T1");
    toaster.semantic.error("T2");
    toaster.loading.show({ message: "L1" });

    toaster.clear();
    flushAnimations();

    expect(document.body.querySelector("[role='status'], [role='alert']")).toBeNull();
    toaster.destroy();
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe("destroy()", () => {
  it("removes toast containers from DOM", () => {
    const toaster = createToaster();
    toaster.semantic.success("Bye");
    expect(document.body.querySelector("[data-toast-container]")).not.toBeNull();

    toaster.destroy();
    expect(document.body.querySelector("[data-toast-container]")).toBeNull();
  });

  it("removes the instance style element", () => {
    const toaster = createToaster({ tokens: { success: "purple" } });
    const before = document.head.querySelectorAll("style[id^='toast-instance-']").length;
    toaster.destroy();
    const after = document.head.querySelectorAll("style[id^='toast-instance-']").length;
    expect(after).toBe(before - 1);
  });

  it("subsequent calls after destroy() throw", () => {
    const toaster = createToaster();
    toaster.destroy();
    expect(() => toaster.semantic.success("Ghost")).toThrow(/destroyed/);
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

// ---------------------------------------------------------------------------
// Interactive dialogs (toaster.interactive + flat aliases)
// ---------------------------------------------------------------------------

describe("interactive.confirm", () => {
  it("resolves true when confirm button clicked", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.confirm("Delete?");

    const confirmBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();

    await expect(handle.result).resolves.toBe(true);
    toaster.destroy();
  });

  it("resolves false and closes the dialog when dismissed programmatically", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.confirm("Delete?");

    const dialog = document.body.querySelector("dialog");
    expect(dialog?.open).toBe(true);

    handle.dismiss();

    await expect(handle.result).resolves.toBe(false);
    expect(dialog?.open).toBe(false);
    toaster.destroy();
  });
});

describe("interactive.prompt", () => {
  it("resolves with typed value when submitted", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.prompt("Your name?", { defaultValue: "Gustavo" });

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
    const handle = toaster.interactive.prompt("Name?");

    const cancelBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-secondary");
    cancelBtn!.click();

    await expect(handle.result).resolves.toBeNull();
    toaster.destroy();
  });
});

describe("interactive.alert", () => {
  it("resolves void when OK clicked", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.alert("Notice!", { okLabel: "Got it" });

    const okBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    okBtn!.click();

    await expect(handle.result).resolves.toBeUndefined();
    toaster.destroy();
  });

  it("should clean up event listeners on dialog reuse via AbortController", async () => {
    const toaster = createToaster();

    const handle1 = toaster.interactive.confirm("First confirm?");
    handle1.dismiss();
    await handle1.settled;

    const handle2 = toaster.interactive.confirm("Second confirm?");
    const cancelBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-secondary");
    cancelBtn!.click();

    await expect(handle2.result).resolves.toBe(false);
    toaster.destroy();
  });

  it("applies correct button semantic class depending on type option", async () => {
    const toaster = createToaster();

    const handleConfirm = toaster.interactive.confirm("Delete danger?", { type: "danger" });
    const dangerConfirmBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-danger");
    expect(dangerConfirmBtn).toBeTruthy();
    expect(dangerConfirmBtn?.className).toContain("toast-dialog-btn-danger");
    handleConfirm.dismiss();
    await handleConfirm.settled;

    const handlePrompt = toaster.interactive.prompt("Name secondary?", { type: "secondary" });
    const secondarySubmitBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-secondary");
    expect(secondarySubmitBtn).toBeTruthy();
    expect(secondarySubmitBtn?.className).toContain("toast-dialog-btn-secondary");
    handlePrompt.dismiss();
    await handlePrompt.settled;

    const handleAlert = toaster.interactive.alert("Success alert!", { type: "success" });
    const successOkBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-success");
    expect(successOkBtn).toBeTruthy();
    expect(successOkBtn?.className).toContain("toast-dialog-btn-success");
    handleAlert.dismiss();
    await handleAlert.settled;

    toaster.destroy();
  });
});

describe("container isolation", () => {
  it("destroying one toaster should not remove containers or toasts of another instance", () => {
    const t1 = createToaster();
    const t2 = createToaster();

    t1.semantic.success("Toaster 1 Success");
    t2.semantic.success("Toaster 2 Success");

    expect(document.body.innerHTML).toContain("Toaster 1 Success");
    expect(document.body.innerHTML).toContain("Toaster 2 Success");

    t1.destroy();

    expect(document.body.innerHTML).not.toContain("Toaster 1 Success");
    expect(document.body.innerHTML).toContain("Toaster 2 Success");

    t2.destroy();
    expect(document.body.innerHTML).not.toContain("Toaster 2 Success");
  });
});

describe("SSR compatibility", () => {
  it("should not access document/window during initialization to be SSR safe", () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;

    try {
      delete (globalThis as Record<string, unknown>).document;
      delete (globalThis as Record<string, unknown>).window;

      const toaster = createToaster();
      expect(toaster).toBeDefined();
    } finally {
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    }
  });
});

describe("positioning and margins", () => {
  it("should support top-center, bottom-center, and center positions", () => {
    const toaster = createToaster();
    const h1 = toaster.semantic.success("Top Center", { position: "top-center" });
    const h2 = toaster.semantic.success("Bottom Center", { position: "bottom-center" });
    const h3 = toaster.semantic.success("Center", { position: "center" });

    const topCenterContainer = document.body.querySelector("[data-toast-container*='top-center']") as HTMLDivElement;
    const bottomCenterContainer = document.body.querySelector(
      "[data-toast-container*='bottom-center']",
    ) as HTMLDivElement;
    // Query exact container for center position
    const centerContainer = document.body.querySelector("[data-toast-container$='-body-center']") as HTMLDivElement;

    expect(topCenterContainer).not.toBeNull();
    expect(bottomCenterContainer).not.toBeNull();
    expect(centerContainer).not.toBeNull();

    expect(topCenterContainer.className).toContain("top-[var(--toast-margin-y,1rem)] left-1/2 -translate-x-1/2");
    expect(bottomCenterContainer.className).toContain("bottom-[var(--toast-margin-y,1rem)] left-1/2 -translate-x-1/2");
    expect(centerContainer.className).toContain("top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2");

    h1.dismiss();
    h2.dismiss();
    h3.dismiss();
    toaster.destroy();
  });

  it("should apply margin as css variable on containers", () => {
    const toaster = createToaster({ margin: "24px" });
    toaster.semantic.success("Margin Test", { position: "top-left" });

    const container = document.body.querySelector("[data-toast-container*='top-left']") as HTMLDivElement;
    expect(container).not.toBeNull();
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("24px");
    expect(container.style.getPropertyValue("--toast-margin-y")).toBe("24px");

    toaster.destroy();
  });

  it("should apply granular margins (x and y) as css variables on containers", () => {
    const toaster = createToaster({ margin: { x: "15px", y: "30px" } });
    toaster.semantic.success("Granular Margin Test", { position: "top-left" });

    const container = document.body.querySelector("[data-toast-container*='top-left']") as HTMLDivElement;
    expect(container).not.toBeNull();
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("15px");
    expect(container.style.getPropertyValue("--toast-margin-y")).toBe("30px");

    toaster.destroy();
  });

  it("should support dynamic margin updates via configure()", () => {
    const toaster = createToaster({ margin: "10px" });
    toaster.semantic.success("Dynamic Margin", { position: "top-left" });

    const container = document.body.querySelector("[data-toast-container*='top-left']") as HTMLDivElement;
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("10px");

    toaster.configure({ margin: "40px" });
    expect(container.style.getPropertyValue("--toast-margin-x")).toBe("40px");
    expect(container.style.getPropertyValue("--toast-margin-y")).toBe("40px");

    toaster.destroy();
  });
});

// ---------------------------------------------------------------------------
// Toast update
// ---------------------------------------------------------------------------

describe("Toast update", () => {
  it("should update message text dynamically", () => {
    const toaster = createToaster();
    const handle = toaster.semantic.success("Initial message");

    const element = document.body.querySelector("[role='status']");
    expect(element?.textContent).toContain("Initial message");

    handle.update({ message: "Updated message" });
    expect(element?.textContent).toContain("Updated message");
    expect(element?.textContent).not.toContain("Initial message");

    toaster.destroy();
  });

  it("should update token overrides dynamically", () => {
    const toaster = createToaster();
    const handle = toaster.semantic.success("Tokens test", {
      tokens: { success: "red" },
    });

    const element = document.body.querySelector<HTMLDivElement>("[role='status']");
    expect(element?.style.getPropertyValue("--toast-color-success")).toBe("red");

    handle.update({ tokens: { success: "blue" } });
    expect(element?.style.getPropertyValue("--toast-color-success")).toBe("blue");

    toaster.destroy();
  });

  it("should replace custom class name dynamically without accumulating", () => {
    const toaster = createToaster();
    const handle = toaster.semantic.success("Class test", {
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

    toaster.interactive.alert("First alert");
    const handle2 = toaster.interactive.alert("Second alert");

    const dialog = document.body.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    expect(document.body.innerHTML).toContain("First alert");
    expect(document.body.innerHTML).not.toContain("Second alert");

    const okBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    okBtn!.click();

    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.innerHTML).toContain("First alert");
    expect(document.body.innerHTML).not.toContain("Second alert");

    dialog!.dispatchEvent(new Event("transitionend"));

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

    toaster.interactive.alert("First alert");
    const handle2 = toaster.interactive.alert("Second alert");

    const okBtn = document.body.querySelector<HTMLButtonElement>(".toast-dialog-btn-primary");
    okBtn!.click();

    // Fallback: 150ms + 50ms buffer = 200ms. At 50ms, it should still show first alert.
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.innerHTML).toContain("First alert");

    // At 250ms, the fallback timeout should have fired and loaded the second alert.
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
    const handle = toaster.interactive.confirm("Confirm message");

    const dialog = document.body.querySelector("dialog")!;
    expect(dialog.open).toBe(true);

    // Mock getBoundingClientRect
    dialog.getBoundingClientRect = () => ({
      left: 100,
      right: 300,
      top: 100,
      bottom: 200,
      width: 200,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    // Click outside/backdrop (should dismiss)
    const clickOutside = new MouseEvent("click", {
      bubbles: true,
      clientX: 50,
      clientY: 50,
    });
    dialog.dispatchEvent(clickOutside);

    const result = await handle.result;
    expect(result).toBe(false);
    expect(dialog.open).toBe(false);

    toaster.destroy();
  });

  it("should dismiss prompt modal on backdrop click by default", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.prompt("Prompt message");

    const dialog = document.body.querySelector("dialog")!;
    expect(dialog.open).toBe(true);

    // Mock getBoundingClientRect
    dialog.getBoundingClientRect = () => ({
      left: 100,
      right: 300,
      top: 100,
      bottom: 200,
      width: 200,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    // Click outside/backdrop (should dismiss)
    const clickOutside = new MouseEvent("click", {
      bubbles: true,
      clientX: 50,
      clientY: 50,
    });
    dialog.dispatchEvent(clickOutside);

    const result = await handle.result;
    expect(result).toBeNull();
    expect(dialog.open).toBe(false);

    toaster.destroy();
  });

  it("should dismiss alert modal on backdrop click by default", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.alert("Alert message");

    const dialog = document.body.querySelector("dialog")!;
    expect(dialog.open).toBe(true);

    // Mock getBoundingClientRect
    dialog.getBoundingClientRect = () => ({
      left: 100,
      right: 300,
      top: 100,
      bottom: 200,
      width: 200,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    // Click outside/backdrop (should dismiss)
    const clickOutside = new MouseEvent("click", {
      bubbles: true,
      clientX: 50,
      clientY: 50,
    });
    dialog.dispatchEvent(clickOutside);

    await handle.result;
    expect(dialog.open).toBe(false);

    toaster.destroy();
  });

  it("should NOT dismiss modal on backdrop click if shouldBackdropDismiss: false is passed", async () => {
    const toaster = createToaster();

    // Test for confirm
    const handleConfirm = toaster.interactive.confirm("Confirm message", { shouldBackdropDismiss: false });
    const dialogConfirm = document.body.querySelector("dialog")!;
    dialogConfirm.getBoundingClientRect = () => ({
      left: 100,
      right: 300,
      top: 100,
      bottom: 200,
      width: 200,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => {},
    });
    const clickOutside = new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 50 });
    dialogConfirm.dispatchEvent(clickOutside);
    expect(dialogConfirm.open).toBe(true);
    handleConfirm.dismiss();
    await handleConfirm.settled;

    // Test for prompt
    const handlePrompt = toaster.interactive.prompt("Prompt message", { shouldBackdropDismiss: false });
    const dialogPrompt = document.body.querySelector("dialog")!;
    dialogPrompt.getBoundingClientRect = () => ({
      left: 100,
      right: 300,
      top: 100,
      bottom: 200,
      width: 200,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => {},
    });
    dialogPrompt.dispatchEvent(clickOutside);
    expect(dialogPrompt.open).toBe(true);
    handlePrompt.dismiss();
    await handlePrompt.settled;

    toaster.destroy();
  });

  it("should render title in interactive dialogs when provided", () => {
    const toaster = createToaster();

    // confirm
    const h1 = toaster.interactive.confirm("Message 1", { title: "Title 1" });
    let titleEl = document.body.querySelector(".toast-dialog-title");
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe("Title 1");
    h1.dismiss();

    // prompt
    const h2 = toaster.interactive.prompt("Message 2", { title: "Title 2" });
    titleEl = document.body.querySelector(".toast-dialog-title");
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe("Title 2");
    h2.dismiss();

    // alert
    const h3 = toaster.interactive.alert("Message 3", { title: "Title 3" });
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
    const handle = toaster.semantic.success("Hover Test");
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
    const handle = toaster.semantic.success("Focus Test");
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
