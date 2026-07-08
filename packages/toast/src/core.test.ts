// @vitest-environment jsdom
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
});

// ---------------------------------------------------------------------------
// Flat semantic aliases
// ---------------------------------------------------------------------------

describe("flat semantic aliases", () => {
  it("success/error/warning/info render to DOM and return a handle", () => {
    const toaster = createToaster();
    const h = toaster.success("Saved!");
    expect(document.body.innerHTML).toContain("Saved!");
    expect(typeof h.dismiss).toBe("function");
    expect(typeof h.update).toBe("function");
    expect(h.state).toBe("visible");
    h.dismiss();
    toaster.destroy();
  });

  it("handle.dismiss() hides the toast", () => {
    const toaster = createToaster();
    const h = toaster.error("Oops");
    expect(document.body.innerHTML).toContain("Oops");
    h.dismiss();
    flushAnimations();
    expect(document.body.querySelector("[role='alert']")).toBeNull();
    toaster.destroy();
  });

  it("handle.update() patches message text in place", () => {
    const toaster = createToaster();
    const h = toaster.info("Loading…");
    h.update({ message: "Done!" });
    expect(document.body.innerHTML).toContain("Done!");
    h.dismiss();
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
});

// ---------------------------------------------------------------------------
// Global clear()
// ---------------------------------------------------------------------------

describe("toaster.clear()", () => {
  it("hides all non-interactive toasts", () => {
    const toaster = createToaster();
    toaster.success("T1");
    toaster.error("T2");
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
    toaster.success("Bye");
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

// ---------------------------------------------------------------------------
// Interactive dialogs (toaster.interactive + flat aliases)
// ---------------------------------------------------------------------------

describe("interactive.confirm", () => {
  it("resolves true when confirm button clicked", async () => {
    const toaster = createToaster();
    const handle = toaster.interactive.confirm("Delete?");

    const confirmBtn = document.body.querySelector<HTMLButtonElement>(".btn.primary");
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();

    await expect(handle.result).resolves.toBe(true);
    toaster.destroy();
  });

  it("resolves false when cancel button clicked", async () => {
    const toaster = createToaster();
    const handle = toaster.confirm("Delete?", { cancelLabel: "Abort" });

    const cancelBtn = document.body.querySelector<HTMLButtonElement>(".btn.secondary");
    expect(cancelBtn).toBeTruthy();
    cancelBtn!.click();

    await expect(handle.result).resolves.toBe(false);
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

    const submitBtn = document.body.querySelector<HTMLButtonElement>(".btn.primary");
    submitBtn!.click();

    await expect(handle.result).resolves.toBe("Antigravity");
    toaster.destroy();
  });

  it("resolves null when cancelled", async () => {
    const toaster = createToaster();
    const handle = toaster.prompt("Name?");

    const cancelBtn = document.body.querySelector<HTMLButtonElement>(".btn.secondary");
    cancelBtn!.click();

    await expect(handle.result).resolves.toBeNull();
    toaster.destroy();
  });
});

describe("interactive.alert", () => {
  it("resolves void when OK clicked", async () => {
    const toaster = createToaster();
    const handle = toaster.alert("Notice!", { okLabel: "Got it" });

    const okBtn = document.body.querySelector<HTMLButtonElement>(".btn.primary");
    okBtn!.click();

    await expect(handle.result).resolves.toBeUndefined();
    toaster.destroy();
  });
});
