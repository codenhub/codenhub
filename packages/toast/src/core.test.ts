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

beforeEach(() => {
  document.body.innerHTML = "";
  animations = [];

  // jsdom doesn't implement the Web Animations API — stub it so show() doesn't throw.
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createToaster Factory Singleton", () => {
  it("should return the same singleton instance", () => {
    const t1 = createToaster();
    const t2 = createToaster();
    expect(t1).toBe(t2);
  });

  it("should support configuration overrides", () => {
    const toaster = createToaster({ defaults: { duration: 1000 } });
    const toast = toaster.showToast({ message: "test" });
    // @ts-expect-error accessing protected options
    expect(toast.options.duration).toBe(1000);
    toast.hide();
  });

  it("should support global token configurations", () => {
    const existing = document.getElementById("global-toast-tokens");
    if (existing) {
      existing.remove();
    }
    const toaster = createToaster({ tokens: { success: "rgb(0, 0, 255)" } });
    const styleElement = document.getElementById("global-toast-tokens") as HTMLStyleElement | null;
    expect(styleElement).not.toBeNull();
    expect(styleElement?.textContent).toContain("--toast-color-success: rgb(0, 0, 255);");

    toaster.configure({ tokens: { success: "rgb(255, 255, 0)" } });
    expect(styleElement?.textContent).toContain("--toast-color-success: rgb(255, 255, 0);");
  });
});

describe("Toaster Actions", () => {
  it("should show semantic toasts", () => {
    const toaster = createToaster();
    const toast = toaster.success("Saved successfully");
    expect(document.body.innerHTML).toContain("Saved successfully");
    toast.hide();
  });

  it("should show loading toast", () => {
    const toaster = createToaster();
    const toast = toaster.loading("Loading...");
    expect(document.body.innerHTML).toContain("Loading...");
    // @ts-expect-error accessing protected options
    expect(toast.options.autoDismiss).toBe(false);
    toast.hide();
  });

  it("should clear all active toasts", () => {
    const toaster = createToaster();
    toaster.success("T1");
    toaster.error("T2");
    expect(document.body.innerHTML).toContain("T1");
    expect(document.body.innerHTML).toContain("T2");

    toaster.clear();

    // Trigger animation completion for hides
    animations.forEach((anim) => {
      if (anim.onfinish) {
        anim.onfinish();
      }
    });

    expect(document.body.querySelector("[role='status'], [role='alert']")).toBeNull();
  });
});

describe("Interactive Dialogs", () => {
  it("should resolve confirm promise correctly on Confirm and Cancel", async () => {
    const toaster = createToaster();

    // Test Confirm
    const p1 = toaster.confirm("Are you sure?");
    const confirmBtn = document.body.querySelector(".btn.primary") as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();

    // Trigger hidden animation
    animations.forEach((anim) => {
      if (anim.onfinish) {
        anim.onfinish();
      }
    });

    await expect(p1).resolves.toBe(true);

    // Test Cancel
    const p2 = toaster.confirm("Are you sure?");
    const cancelBtn = document.body.querySelector(".btn.secondary") as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    cancelBtn.click();

    animations.forEach((anim) => {
      if (anim.onfinish) {
        anim.onfinish();
      }
    });

    await expect(p2).resolves.toBe(false);
  });

  it("should resolve prompt promise with value on Submit and null on Cancel", async () => {
    const toaster = createToaster();

    // Test Submit
    const p1 = toaster.prompt("Your name?", "Gustavo");
    const input = document.body.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Gustavo");
    input.value = "Antigravity";

    const submitBtn = document.body.querySelector(".btn.primary") as HTMLButtonElement;
    submitBtn.click();

    animations.forEach((anim) => {
      if (anim.onfinish) {
        anim.onfinish();
      }
    });

    await expect(p1).resolves.toBe("Antigravity");

    // Test Cancel
    const p2 = toaster.prompt("Your name?");
    const cancelBtn = document.body.querySelector(".btn.secondary") as HTMLButtonElement;
    cancelBtn.click();

    animations.forEach((anim) => {
      if (anim.onfinish) {
        anim.onfinish();
      }
    });

    await expect(p2).resolves.toBe(null);
  });

  it("should resolve alert promise on OK", async () => {
    const toaster = createToaster();
    const p = toaster.alert("Notice");

    const okBtn = document.body.querySelector(".btn.primary") as HTMLButtonElement;
    okBtn.click();

    animations.forEach((anim) => {
      if (anim.onfinish) {
        anim.onfinish();
      }
    });

    await expect(p).resolves.toBeUndefined();
  });
});
