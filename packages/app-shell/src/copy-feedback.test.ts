import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCopyController } from "./copy-feedback.ts";

function createCopyButton() {
  const attributes = new Map([["aria-label", "Copy TypeScript code"]]);
  return {
    dataset: {} as Record<string, string | undefined>,
    title: "Copy code",
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
}

function createDeferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("createCopyController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes the exact text and announces the copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const button = createCopyButton();
    const status = { textContent: "" };
    const text = "const value = '<tag>';\n\n";

    await createCopyController().copy({ button, clipboard: { writeText }, status, text });

    expect(writeText).toHaveBeenCalledWith(text);
    expect(button.dataset.copyState).toBe("copied");
    expect(button.getAttribute("aria-label")).toBe("Copied");
    expect(button.title).toBe("Copied");
    expect(status.textContent).toBe("Copied");
  });

  it("announces a denied clipboard write while retaining the failed button state", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const button = createCopyButton();
    const status = { textContent: "" };

    await createCopyController().copy({ button, clipboard: { writeText }, status, text: "code" });

    expect(button.dataset.copyState).toBe("failed");
    expect(button.getAttribute("aria-label")).toBe("Copy failed. Try again");
    expect(button.title).toBe("Copy failed");
    expect(status.textContent).toBe("Copy failed");
  });

  it("reports a missing Clipboard API as a failed copy", async () => {
    const button = createCopyButton();

    await createCopyController().copy({ button, clipboard: undefined, status: { textContent: "" }, text: "code" });

    expect(button.dataset.copyState).toBe("failed");
  });

  it("resets repeated copies to the initial labels after the latest delay", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    const button = createCopyButton();
    const status = { textContent: "" };
    const controller = createCopyController();

    await controller.copy({ button, clipboard, status, text: "code" });
    vi.advanceTimersByTime(1000);
    await controller.copy({ button, clipboard, status, text: "code" });

    expect(button.getAttribute("aria-label")).toBe("Copied");
    expect(status.textContent).toBe("Copied");

    vi.advanceTimersByTime(1999);
    expect(button.getAttribute("aria-label")).toBe("Copied");

    vi.advanceTimersByTime(1);
    expect(button.dataset.copyState).toBeUndefined();
    expect(button.getAttribute("aria-label")).toBe("Copy TypeScript code");
    expect(button.title).toBe("Copy code");
    expect(status.textContent).toBe("");
  });

  it("lets the latest copy own feedback when clipboard writes resolve out of order", async () => {
    const firstWrite = createDeferred();
    const secondWrite = createDeferred();
    const writes = [firstWrite, secondWrite];
    const clipboard = {
      writeText: vi.fn(() => writes.shift()!.promise),
    };
    const button = createCopyButton();
    const status = { textContent: "" };
    const controller = createCopyController();

    const firstCopy = controller.copy({ button, clipboard, status, text: "first" });
    const secondCopy = controller.copy({ button, clipboard, status, text: "second" });
    secondWrite.resolve();
    await secondCopy;

    expect(button.dataset.copyState).toBe("copied");
    expect(status.textContent).toBe("Copied");

    firstWrite.reject();
    await firstCopy;

    expect(button.dataset.copyState).toBe("copied");
    expect(button.getAttribute("aria-label")).toBe("Copied");
    expect(status.textContent).toBe("Copied");
  });

  it("clears visible feedback immediately when a new copy begins", async () => {
    const pendingWrite = createDeferred();
    const clipboard = {
      writeText: vi.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(pendingWrite.promise),
    };
    const button = createCopyButton();
    const status = { textContent: "" };
    const controller = createCopyController();

    await controller.copy({ button, clipboard, status, text: "first" });
    expect(button.dataset.copyState).toBe("copied");

    const pendingCopy = controller.copy({ button, clipboard, status, text: "second" });

    expect(button.dataset.copyState).toBeUndefined();
    expect(button.getAttribute("aria-label")).toBe("Copy TypeScript code");
    expect(button.title).toBe("Copy code");
    expect(status.textContent).toBe("");

    pendingWrite.resolve();
    await pendingCopy;
  });
});
