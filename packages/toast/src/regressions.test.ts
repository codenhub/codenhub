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
  vi.useRealTimers();
});

describe("configuration boundaries", () => {
  it.each([
    { duration: Number.NaN },
    { duration: Number.POSITIVE_INFINITY },
    { duration: -1 },
    { maxVisible: 0 },
    { maxVisible: 1.5 },
  ])("should reject invalid global configuration $duration $maxVisible", (config) => {
    expect(() => createToaster(config)).toThrow(/duration|maxVisible/);
  });

  it("should reject changing the container after construction", () => {
    const toaster = createToaster();
    const container = document.createElement("section");

    // @ts-expect-error Runtime guard protects JavaScript consumers too.
    expect(() => toaster.configure({ container })).toThrow(/container/);
    toaster.destroy();
  });

  it("should own a snapshot of construction configuration", () => {
    const originalContainer = document.createElement("section");
    const replacementContainer = document.createElement("section");
    document.body.append(originalContainer, replacementContainer);
    const config = { container: originalContainer };
    const toaster = createToaster(config);

    config.container = replacementContainer;
    toaster.semantic.success("Owned config");

    expect(originalContainer.textContent).toContain("Owned config");
    expect(replacementContainer.textContent).not.toContain("Owned config");
    toaster.destroy();
  });

  it("should reject invalid nested defaults during configuration", () => {
    expect(() => createToaster({ semantic: { duration: -1 } })).toThrow(/duration/);
    const toaster = createToaster();
    expect(() => toaster.configure({ custom: { duration: Number.NaN } })).toThrow(/duration/);
    toaster.destroy();
  });

  it("should reject invalid runtime enum values", () => {
    expect(() => createToaster({ position: "sideways" as never })).toThrow(/position/);
    const toaster = createToaster();
    expect(() => toaster.configure({ appearance: "glass" as never })).toThrow(/appearance/);
    expect(() => toaster.semantic.success("Invalid", { role: "log" as never })).toThrow(/role/);
    expect(() => toaster.semantic.show({ message: "Invalid", type: "critical" as never })).toThrow(/type/);
    toaster.destroy();
  });

  it("should honor a semantic role override", () => {
    const toaster = createToaster();
    toaster.semantic.error("Recoverable", { role: "status" });

    expect(document.body.querySelector("[role='status']")?.textContent).toContain("Recoverable");
    toaster.destroy();
  });
});

describe("toast lifecycle", () => {
  it("should notify late subscribers when a lifecycle phase already happened", () => {
    const toaster = createToaster();
    const handle = toaster.semantic.success("Saved");
    const onShow = vi.fn();

    handle.onShow(onShow);

    expect(onShow).toHaveBeenCalledOnce();
    expect(onShow).toHaveBeenCalledWith(handle);
    toaster.destroy();
  });

  it("should pass public ToastHandle to lifecycle subscribers", async () => {
    const toaster = createToaster();
    const onShow = vi.fn();
    const onShown = vi.fn();
    const onHide = vi.fn();
    const onHidden = vi.fn();

    const handle = toaster.semantic.success("Info");
    handle.onShow(onShow);
    handle.onShown(onShown);
    handle.onHide(onHide);
    handle.onHidden(onHidden);

    expect(onShow).toHaveBeenCalledWith(handle);

    flushAnimations();
    expect(onShown).toHaveBeenCalledWith(handle);

    handle.dismiss();
    expect(onHide).toHaveBeenCalledWith(handle);

    flushAnimations();
    await handle.settled;
    expect(onHidden).toHaveBeenCalledWith(handle);

    toaster.destroy();
  });

  it("should finish hiding when a lifecycle subscriber throws", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const toaster = createToaster();
    const handle = toaster.semantic.success("Saved");
    handle.onHide(() => {
      throw new Error("consumer callback failed");
    });

    handle.dismiss();
    flushAnimations();

    await expect(handle.settled).resolves.toBeUndefined();
    expect(handle.state).toBe("hidden");
    expect(reportError).toHaveBeenCalledOnce();
    toaster.destroy();
  });

  it("should expose queued state and preserve FIFO admission", () => {
    const toaster = createToaster({ maxVisible: 1, shouldAutoDismiss: false });
    const first = toaster.semantic.info("First");
    const second = toaster.semantic.info("Second");
    const third = toaster.semantic.info("Third");

    expect(first.state).toBe("hiding");
    expect(second.state).toBe("queued");
    expect(third.state).toBe("queued");
    expect(document.body.textContent).not.toContain("Third");

    flushAnimations();
    expect(second.state).toBe("hiding");
    expect(third.state).toBe("queued");

    flushAnimations();
    expect(third.state).toBe("visible");
    toaster.destroy();
  });

  it("should complete terminal lifecycle when a queued toast is dismissed", async () => {
    const toaster = createToaster({ maxVisible: 1, shouldAutoDismiss: false });
    toaster.semantic.info("First");
    const queued = toaster.semantic.info("Queued");
    const onHidden = vi.fn();

    queued.dismiss();
    queued.onHidden(onHidden);

    await expect(queued.settled).resolves.toBeUndefined();
    expect(queued.state).toBe("hidden");
    expect(onHidden).toHaveBeenCalledOnce();
    toaster.destroy();
  });

  it("should resume auto-dismiss using remaining duration", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 2000 });
    const handle = toaster.semantic.success("Timed");
    flushAnimations();
    const element = document.body.querySelector("[role='status']")!;

    vi.advanceTimersByTime(1000);
    element.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(5000);
    element.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(1000);
    flushAnimations();

    expect(handle.state).toBe("hidden");
    toaster.destroy();
  });

  it("should not start auto-dismiss before entrance completes", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 2000 });
    const handle = toaster.semantic.success("Entering");
    const element = document.body.querySelector("[role='status']")!;

    element.dispatchEvent(new MouseEvent("mouseenter"));
    element.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(1000);
    flushAnimations();
    vi.advanceTimersByTime(1000);

    expect(handle.state).toBe("visible");
    vi.advanceTimersByTime(1000);
    flushAnimations();
    expect(handle.state).toBe("hidden");
    toaster.destroy();
  });
});

describe("content and token security", () => {
  it("should reject token values that are not CSS colors", () => {
    expect(() => createToaster({ tokens: { success: "red; } body { display: none" } })).toThrow(/color/);
  });

  it("should reject invalid per-toast and dialog token colors", () => {
    const toaster = createToaster();
    const tokens = { success: "red; } body { display: none" };

    expect(() => toaster.semantic.success("Unsafe", { tokens })).toThrow(/color/);
    expect(() => toaster.interactive.confirm("Unsafe", { tokens })).toThrow(/color/);
    toaster.destroy();
  });

  it("should reject invalid token colors during updates", () => {
    const toaster = createToaster();
    const handle = toaster.semantic.success("Safe");

    expect(() => handle.update({ tokens: { success: "red; } body { display: none" } })).toThrow(/color/);
    toaster.destroy();
  });

  it("should remove active styling and enforce safe blank links in HTML content", () => {
    const toaster = createToaster();
    toaster.custom.show({
      content: '<a id="unsafe" style="position:fixed" target="_BLANK" href="https://example.com">Open</a>',
    });
    const link = document.body.querySelector("a")!;

    expect(link.hasAttribute("id")).toBe(false);
    expect(link.hasAttribute("style")).toBe(false);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    toaster.destroy();
  });

  it("should support containers whose IDs contain selector metacharacters", () => {
    const container = document.createElement("section");
    container.id = 'quoted"id';
    document.body.appendChild(container);
    const toaster = createToaster({ container });

    expect(() => toaster.semantic.success("Safe selector")).not.toThrow();
    toaster.destroy();
  });

  it("should use the configured container document across realms", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const iframeDocument = iframe.contentDocument!;
    const container = iframeDocument.createElement("main");
    iframeDocument.body.appendChild(container);
    const content = iframeDocument.createElement("span");
    content.textContent = "Cross realm";
    const toaster = createToaster({ container, margin: "8px" });

    toaster.custom.show({ content });
    toaster.configure({ margin: "24px" });
    const stack = container.querySelector<HTMLElement>("[data-toast-container]")!;

    expect(stack.textContent).toContain("Cross realm");
    expect(stack.style.getPropertyValue("--toast-margin-x")).toBe("24px");
    toaster.destroy();
  });

  it("should reject unsupported node types before reserving a stack slot", () => {
    const toaster = createToaster({ maxVisible: 1, shouldAutoDismiss: false });

    expect(() => toaster.custom.show({ content: document })).toThrow(/Node/);
    expect(() => toaster.semantic.success("Still available")).not.toThrow();
    expect(document.body.textContent).toContain("Still available");
    toaster.destroy();
  });
});

describe("interactive dialogs", () => {
  it("should expose an honest interactive handle", () => {
    const toaster = createToaster();
    const handle = toaster.interactive.confirm("Continue?");

    expect(handle.state).toBe("visible");
    expect(Object.keys(handle).sort()).toEqual(["dismiss", "result", "settled", "state"]);
    handle.dismiss();
    toaster.destroy();
  });

  it("should associate dialog text and prompt labels", () => {
    const toaster = createToaster();
    const handle = toaster.interactive.prompt("Project name", { title: "Create project" });
    const dialog = document.body.querySelector("dialog")!;
    const input = dialog.querySelector("input")!;

    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(input.getAttribute("aria-labelledby")).toBeTruthy();
    handle.dismiss();
    toaster.destroy();
  });

  it("should reject a failed modal and continue its queue", async () => {
    const showModal = vi
      .spyOn(HTMLDialogElement.prototype, "showModal")
      .mockImplementationOnce(() => {
        throw new DOMException("Detached", "InvalidStateError");
      })
      .mockImplementation(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      });
    const toaster = createToaster();
    const failed = toaster.interactive.confirm("First");
    const next = toaster.interactive.confirm("Second");

    await expect(failed.result).rejects.toThrow("Detached");
    expect(showModal).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("Second");
    next.dismiss();
    toaster.destroy();
  });

  it("should ignore Enter while prompt input is composing", () => {
    const toaster = createToaster();
    const handle = toaster.interactive.prompt("Name");
    const input = document.body.querySelector("input")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));

    expect(handle.state).toBe("visible");
    handle.dismiss();
    toaster.destroy();
  });

  it("should restore the original focus after a queued dialog sequence", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const toaster = createToaster();
    const first = toaster.interactive.alert("First");
    const second = toaster.interactive.alert("Second");

    first.dismiss();
    await first.settled;
    second.dismiss();
    await second.settled;

    expect(document.activeElement).toBe(opener);
    toaster.destroy();
  });
});
