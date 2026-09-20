import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createToaster } from "./core";
import { flushAnimations, installAnimateMock, installDialogMocks } from "./test-utils";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((element) => element.remove());
  installAnimateMock();
  installDialogMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("overflow protection", () => {
  it("queues a new toast instead of evicting a hovered one", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster.semantic.success("Hovered");
    flushAnimations();
    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    element.dispatchEvent(new MouseEvent("mouseenter"));

    const second = toaster.semantic.success("Waiting");

    expect(first.state).toBe("visible");
    expect(second.state).toBe("queued");
    toaster.destroy();
  });

  it("queues a new toast instead of evicting a focused one", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster.semantic.success("Focused");
    flushAnimations();
    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    element.dispatchEvent(new FocusEvent("focusin"));

    const second = toaster.semantic.success("Waiting");

    expect(first.state).toBe("visible");
    expect(second.state).toBe("queued");
    toaster.destroy();
  });

  it("queues a new toast instead of evicting a persistent loader", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const loader = toaster.loading.show({ message: "Working…" });
    const next = toaster.semantic.success("Waiting");

    expect(loader.state).toBe("visible");
    expect(next.state).toBe("queued");
    toaster.destroy();
  });

  it("admits queued work once protection is released", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster.semantic.success("Hovered");
    flushAnimations();
    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    element.dispatchEvent(new MouseEvent("mouseenter"));
    const second = toaster.semantic.success("Waiting");
    expect(second.state).toBe("queued");

    element.dispatchEvent(new MouseEvent("mouseleave"));
    first.dismiss();
    flushAnimations();

    expect(second.state).toBe("visible");
    toaster.destroy();
  });

  it("still evicts the oldest unprotected toast normally", () => {
    const toaster = createToaster({ maxVisible: 1, shouldAutoDismiss: false });
    const first = toaster.semantic.info("First");
    const second = toaster.semantic.info("Second");

    expect(first.state).toBe("hiding");
    expect(second.state).toBe("queued");
    toaster.destroy();
  });

  it("protects a persistent (shouldAutoDismiss: false) toast while hovered", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster.semantic.success("Persistent", { shouldAutoDismiss: false });
    flushAnimations();
    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    element.dispatchEvent(new MouseEvent("mouseenter"));

    const second = toaster.semantic.success("Waiting");

    expect(first.state).toBe("visible");
    expect(second.state).toBe("queued");
    toaster.destroy();
  });

  it("protects a persistent (shouldAutoDismiss: false) toast while focused", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster.semantic.success("Persistent", { shouldAutoDismiss: false });
    flushAnimations();
    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    element.dispatchEvent(new FocusEvent("focusin"));

    const second = toaster.semantic.success("Waiting");

    expect(first.state).toBe("visible");
    expect(second.state).toBe("queued");
    toaster.destroy();
  });

  it("evicts a persistent toast as soon as it is unhovered, with no explicit dismiss or configure()", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster.semantic.success("Persistent", { shouldAutoDismiss: false });
    flushAnimations();
    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    element.dispatchEvent(new MouseEvent("mouseenter"));
    const second = toaster.semantic.success("Waiting");
    expect(second.state).toBe("queued");

    element.dispatchEvent(new MouseEvent("mouseleave"));

    expect(first.state).toBe("hiding");
    flushAnimations();
    expect(second.state).toBe("visible");
    toaster.destroy();
  });

  it("re-evaluates the queue as soon as a long-duration toast is unhovered, not only once it times out", () => {
    const toaster = createToaster({ maxVisible: 1, duration: 100000 });
    const first = toaster.semantic.success("Hovered");
    flushAnimations();
    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    element.dispatchEvent(new MouseEvent("mouseenter"));
    const second = toaster.semantic.success("Waiting");
    expect(second.state).toBe("queued");

    element.dispatchEvent(new MouseEvent("mouseleave"));

    expect(first.state).toBe("hiding");
    flushAnimations();
    expect(second.state).toBe("visible");
    toaster.destroy();
  });

  it("does not release the slot while either hover or focus still protects it", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster.semantic.success("Both", { shouldAutoDismiss: false });
    flushAnimations();
    const element = document.body.querySelector("[role='status']") as HTMLDivElement;
    element.dispatchEvent(new MouseEvent("mouseenter"));
    element.dispatchEvent(new FocusEvent("focusin"));

    const second = toaster.semantic.success("Waiting");
    expect(second.state).toBe("queued");

    element.dispatchEvent(new MouseEvent("mouseleave"));
    expect(first.state).toBe("visible");
    expect(second.state).toBe("queued");

    element.dispatchEvent(new FocusEvent("focusout"));
    expect(first.state).toBe("hiding");
    toaster.destroy();
  });
});

describe("runtime capacity reconciliation", () => {
  it("evicts down to a newly lowered maxVisible", () => {
    const toaster = createToaster({ maxVisible: 3, shouldAutoDismiss: false });
    const first = toaster.semantic.info("A");
    const second = toaster.semantic.info("B");
    const third = toaster.semantic.info("C");
    expect([first.state, second.state, third.state]).toEqual(["visible", "visible", "visible"]);

    toaster.configure({ maxVisible: 1 });

    expect(first.state).toBe("hiding");
    expect(second.state).toBe("hiding");
    expect(third.state).toBe("visible");
    toaster.destroy();
  });

  it("admits a queued toast once maxVisible is raised", () => {
    // Both loaders, so neither is evicted just to relieve queue pressure --
    // isolating the capacity-increase behavior from ordinary eviction.
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster.loading.show({ message: "A" });
    const second = toaster.loading.show({ message: "B" });
    expect(first.state).toBe("visible");
    expect(second.state).toBe("queued");

    toaster.configure({ maxVisible: 2 });

    expect(first.state).toBe("visible");
    expect(second.state).toBe("visible");
    toaster.destroy();
  });

  it("does not evict a protected toast to satisfy a lowered maxVisible", () => {
    const toaster = createToaster({ maxVisible: 2 });
    const loader = toaster.loading.show({ message: "Working…" });
    const regular = toaster.semantic.success("Other", { shouldAutoDismiss: false });
    expect([loader.state, regular.state]).toEqual(["visible", "visible"]);

    toaster.configure({ maxVisible: 1 });

    // Capacity is now 1, but the loader is protected: the unprotected toast
    // is evicted while the loader keeps showing over the configured limit.
    expect(loader.state).toBe("visible");
    expect(regular.state).toBe("hiding");
    toaster.destroy();
  });
});

describe("rendering failure rollback", () => {
  it("releases the reserved slot when rendering throws, so a queued toast can still be admitted", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const toaster = createToaster({ maxVisible: 1 });

    const createElementSpy = vi.spyOn(document, "createElement").mockImplementationOnce(() => {
      throw new Error("boom");
    });

    const failed = toaster.semantic.success("Never renders");
    expect(failed.state).toBe("hidden");
    expect(reportError).toHaveBeenCalledOnce();
    createElementSpy.mockRestore();

    const next = toaster.semantic.success("Should still render");
    expect(next.state).toBe("visible");
    expect(document.body.textContent).toContain("Should still render");

    toaster.destroy();
  });

  it("still fires onShow for a subscriber added after an early render failure", () => {
    vi.stubGlobal("reportError", vi.fn());
    const toaster = createToaster({ maxVisible: 1 });
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementationOnce(() => {
      throw new Error("boom");
    });

    const failed = toaster.semantic.success("Never renders");
    createElementSpy.mockRestore();
    expect(failed.state).toBe("hidden");

    const onShow = vi.fn();
    failed.onShow(onShow);

    expect(onShow).toHaveBeenCalledOnce();
    toaster.destroy();
  });
});

describe("token stylesheet CSP compatibility", () => {
  it("applies a configured nonce to the owned token stylesheet", () => {
    const toaster = createToaster({ tokens: { successBg: "red" }, nonce: "abc123" });
    const styleElement = document.head.querySelector<HTMLStyleElement>("style[data-toast-token-owner]");

    expect(styleElement?.nonce).toBe("abc123");
    toaster.destroy();
  });

  it("removes the owned node and rejects construction if the stylesheet cannot initialize", () => {
    const sheetSpy = vi.spyOn(HTMLStyleElement.prototype, "sheet", "get").mockReturnValue(null);

    expect(() => createToaster({ tokens: { successBg: "red" } })).toThrow(/could not be initialized/);
    expect(document.head.querySelector("style[data-toast-token-owner]")).toBeNull();

    sheetSpy.mockRestore();
  });

  it("does not partially apply a configure() call when its token stylesheet fails", () => {
    const toaster = createToaster({ maxVisible: 3, shouldAutoDismiss: false });
    const first = toaster.semantic.info("A");
    const second = toaster.semantic.info("B");
    const third = toaster.semantic.info("C");
    expect([first.state, second.state, third.state]).toEqual(["visible", "visible", "visible"]);

    const sheetSpy = vi.spyOn(HTMLStyleElement.prototype, "sheet", "get").mockReturnValue(null);
    expect(() => toaster.configure({ maxVisible: 1, tokens: { successBg: "red" } })).toThrow(
      /could not be initialized/,
    );
    sheetSpy.mockRestore();

    // The rejected token application must not have let `maxVisible` (bundled
    // in the same call) take effect: capacity reconciliation never ran.
    expect([first.state, second.state, third.state]).toEqual(["visible", "visible", "visible"]);

    toaster.destroy();
  });

  it("keeps a previously working token stylesheet intact when a later update fails", () => {
    const toaster = createToaster({ tokens: { successBg: "red" } });
    const styleElement = document.head.querySelector<HTMLStyleElement>("style[data-toast-token-owner]");
    expect(styleElement).not.toBeNull();

    const sheetSpy = vi.spyOn(HTMLStyleElement.prototype, "sheet", "get").mockReturnValue(null);
    expect(() => toaster.configure({ tokens: { successBg: "blue" } })).toThrow(/could not be initialized/);
    sheetSpy.mockRestore();

    // The failed replacement must not have torn down the element that was
    // already working before this call.
    expect(document.head.querySelector("style[data-toast-token-owner]")).toBe(styleElement);
    const rule = styleElement!.sheet!.cssRules[0] as CSSStyleRule;
    expect(rule.style.getPropertyValue("--toast-color-success-bg")).toBe("red");

    toaster.destroy();
  });
});

describe("live region announcement ordering", () => {
  it("inserts the announcement region before populating its content", () => {
    const toaster = createToaster();
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });

    toaster.semantic.success("Announced");

    const records = observer.takeRecords();
    observer.disconnect();
    const toastNode = document.body.querySelector("[role='status']") as HTMLElement;

    const insertionIndex = records.findIndex((record) => Array.from(record.addedNodes).includes(toastNode));
    const contentIndex = records.findIndex((record) => record.target === toastNode && record.addedNodes.length > 0);

    expect(insertionIndex).toBeGreaterThanOrEqual(0);
    expect(contentIndex).toBeGreaterThan(insertionIndex);
    expect(toastNode.textContent).toContain("Announced");

    toaster.destroy();
  });
});

describe("queued toast updates", () => {
  it("applies an update sent while queued once the toast is admitted", () => {
    const toaster = createToaster({ maxVisible: 1, shouldAutoDismiss: false });
    toaster.semantic.info("First");
    const queued = toaster.semantic.info("Before");
    expect(queued.state).toBe("queued");

    queued.update({ message: "After" });
    expect(document.body.textContent).not.toContain("After");

    // Completes "First"'s eviction (already in flight from admitting the
    // queued toast above), which promotes "queued" into the now-open slot.
    flushAnimations();

    expect(queued.state).toBe("visible");
    expect(document.body.textContent).toContain("After");
    expect(document.body.textContent).not.toContain("Before");
    toaster.destroy();
  });

  it("rejects an invalid queued update immediately rather than storing it", () => {
    const toaster = createToaster({ maxVisible: 1, shouldAutoDismiss: false });
    toaster.semantic.info("First");
    const queued = toaster.semantic.info("Second");

    expect(() => queued.update({ tokens: { successBg: "red; } body { display: none" } })).toThrow(/color/);
    toaster.destroy();
  });
});

describe("option mutation safety", () => {
  it("is not affected by mutating the caller's token object after dispatch", () => {
    const toaster = createToaster();
    const tokens = { successBg: "red" };
    toaster.semantic.success("Snapshot test", { tokens });

    tokens.successBg = "blue";

    const element = document.body.querySelector<HTMLDivElement>("[role='status']");
    expect(element?.style.getPropertyValue("--toast-color-success-bg")).toBe("red");
    toaster.destroy();
  });

  it("does not apply a partial update when token validation fails", () => {
    const toaster = createToaster();
    const handle = toaster.semantic.success("Original message");
    const element = document.body.querySelector("[role='status']");

    expect(() =>
      handle.update({ message: "Changed message", tokens: { successBg: "red; } body { display: none" } }),
    ).toThrow(/color/);

    expect(element?.textContent).toContain("Original message");
    expect(element?.textContent).not.toContain("Changed message");
    toaster.destroy();
  });
});
