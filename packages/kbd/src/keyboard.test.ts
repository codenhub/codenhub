// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { KEYS, keyboard, Keyboard } from "./index";

interface KeyboardTestAccess {
  getDefaultTarget(): EventTarget | undefined;
}

describe("Keyboard", () => {
  afterEach(() => {
    keyboard.clear();
    vi.clearAllMocks();
  });

  it("should identify supported keys and reject unknown keys", () => {
    const handler = vi.fn();
    keyboard.register(KEYS.escape, handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Esc" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should normalize printable letter keys to lowercase", () => {
    const handler = vi.fn();
    keyboard.register(KEYS.k, handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "K" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should register a single key binding", () => {
    const handler = vi.fn();

    keyboard.register(KEYS.escape, handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should not fire a simple binding when modifiers are active", () => {
    const handler = vi.fn();

    keyboard.register(KEYS.escape, handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", ctrlKey: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("should register a shortcut binding", () => {
    const handler = vi.fn();

    keyboard.register({ key: KEYS.k, modifiers: ["ctrl"] }, handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "K", ctrlKey: true }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should ignore shortcut events with unmatched modifiers", () => {
    const handler = vi.fn();

    keyboard.register({ key: KEYS.k, modifiers: ["ctrl"] }, handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "K" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "K", ctrlKey: true, shiftKey: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("should unregister a binding", () => {
    const handler = vi.fn();
    const reg = keyboard.register(KEYS.escape, handler);

    reg.unregister();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("should remove the document listener when the last binding is unregistered", () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    const reg = keyboard.register(KEYS.escape, vi.fn());

    reg.unregister();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("should remove listeners when cleared", () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    keyboard.register(KEYS.escape, vi.fn());
    keyboard.clear();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("should register a binding on a custom target", () => {
    const target = new EventTarget();
    const handler = vi.fn();

    keyboard.register(KEYS.escape, handler, { target });
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should register a keyup binding", () => {
    const handler = vi.fn();

    keyboard.register(KEYS.escape, handler, { event: "keyup" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should allow the handler to prevent default", () => {
    const handler = vi.fn((e: KeyboardEvent) => e.preventDefault());
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });

    keyboard.register(KEYS.escape, handler);
    document.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("should stop propagation and skip subsequent subscriptions in the same scope", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    keyboard.register(KEYS.escape, handler1, { stopPropagation: true });
    keyboard.register(KEYS.escape, handler2);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
  });

  it("should distinguish matching and non-matching keys", () => {
    const handler = vi.fn();

    keyboard.register(KEYS.enter, handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should disable and re-enable a single binding", () => {
    const handler = vi.fn();
    const reg = keyboard.register(KEYS.escape, handler);

    reg.disable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).not.toHaveBeenCalled();

    reg.enable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should disable and re-enable all bindings globally", () => {
    const handler = vi.fn();

    keyboard.register(KEYS.escape, handler);

    keyboard.disable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).not.toHaveBeenCalled();

    keyboard.enable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should reset global enabled state on clear", () => {
    const handler = vi.fn();

    keyboard.disable();
    keyboard.clear();

    keyboard.register(KEYS.escape, handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should report handler exceptions silently to onError", () => {
    const error = new Error("Handler failed");
    const onError = vi.fn();
    const customKeyboard = new Keyboard({ onError });

    customKeyboard.register(KEYS.escape, () => {
      throw error;
    });

    expect(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }).not.toThrow();

    expect(onError).toHaveBeenCalledWith(error, "Keyboard handler failed.");
  });

  it("should report missing target errors to onError", () => {
    const handler = vi.fn();
    const onError = vi.fn();
    const customKeyboard = new Keyboard({ onError });

    vi.spyOn(customKeyboard as unknown as KeyboardTestAccess, "getDefaultTarget").mockReturnValueOnce(undefined);
    const reg = customKeyboard.register(KEYS.escape, handler);

    reg.unregister();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "[Keyboard] Cannot register a keyboard binding without an event target.",
      }),
      "Keyboard binding could not be registered.",
    );
  });
});
