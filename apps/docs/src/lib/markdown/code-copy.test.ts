import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyCodeText, createCodeCopyController, createCodeCopyFeedback, findCodeCopyStatus } from "./code-copy";

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

describe("copyCodeText", () => {
  it("writes the exact rendered code text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const code = "const value = '<tag>';\n\n";

    await expect(copyCodeText(code, { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(code);
  });

  it("reports unavailable clipboard access without throwing", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));

    await expect(copyCodeText("code", { writeText })).resolves.toBe(false);
  });

  it("reports a missing Clipboard API", async () => {
    await expect(copyCodeText("code", undefined)).resolves.toBe(false);
  });
});

describe("code copy feedback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resets repeated clicks to the immutable initial label after the latest delay", () => {
    const button = createCopyButton();
    const status = { textContent: "" };
    const feedback = createCodeCopyFeedback();

    feedback.showResult({ button, isCopied: true, status });
    vi.advanceTimersByTime(1000);
    feedback.showResult({ button, isCopied: true, status });

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

  it("lets the latest click own feedback when clipboard writes resolve out of order", async () => {
    const firstWrite = createDeferred();
    const secondWrite = createDeferred();
    const writes = [firstWrite, secondWrite];
    const clipboard = {
      writeText: vi.fn(() => writes.shift()!.promise),
    };
    const button = createCopyButton();
    const status = { textContent: "" };
    const controller = createCodeCopyController();

    const firstCopy = controller.copy({ button, clipboard, code: "first", status });
    const secondCopy = controller.copy({ button, clipboard, code: "second", status });
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

  it("announces clipboard failure while retaining the failed button state", () => {
    const button = createCopyButton();
    const status = { textContent: "" };
    const feedback = createCodeCopyFeedback();

    feedback.showResult({ button, isCopied: false, status });

    expect(button.dataset.copyState).toBe("failed");
    expect(button.getAttribute("aria-label")).toBe("Copy failed. Try again");
    expect(button.title).toBe("Copy failed");
    expect(status.textContent).toBe("Copy failed");
  });

  it("resolves and updates status only within the nearest code block", () => {
    const unrelatedStatus = { id: "code-copy-status-1", textContent: "Unrelated content" };
    const localStatus = { id: "code-copy-status-1", textContent: "" };
    const localContainer = { querySelector: vi.fn(() => localStatus) };
    const buttonControl = createCopyButton();
    buttonControl.setAttribute("aria-describedby", "code-copy-status-1");
    const button = {
      ...buttonControl,
      closest: vi.fn(() => localContainer),
    } as unknown as HTMLButtonElement;

    const status = findCodeCopyStatus(button);
    createCodeCopyFeedback().showResult({ button, isCopied: true, status: status! });

    expect(button.closest).toHaveBeenCalledWith(".code-block");
    expect(localContainer.querySelector).toHaveBeenCalledWith("#code-copy-status-1");
    expect(localStatus.textContent).toBe("Copied");
    expect(unrelatedStatus.textContent).toBe("Unrelated content");
  });

  it("clears visible feedback immediately when a new copy begins", async () => {
    const pendingWrite = createDeferred();
    const clipboard = {
      writeText: vi.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(pendingWrite.promise),
    };
    const button = createCopyButton();
    const status = { textContent: "" };
    const controller = createCodeCopyController();

    await controller.copy({ button, clipboard, code: "first", status });
    expect(button.dataset.copyState).toBe("copied");

    const pendingCopy = controller.copy({ button, clipboard, code: "second", status });

    expect(button.dataset.copyState).toBeUndefined();
    expect(button.getAttribute("aria-label")).toBe("Copy TypeScript code");
    expect(button.title).toBe("Copy code");
    expect(status.textContent).toBe("");

    pendingWrite.resolve();
    await pendingCopy;
  });
});
