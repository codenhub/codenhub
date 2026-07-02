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

  it("should allow setting error handler after instantiation", () => {
    const error = new Error("Another handler failed");
    const onError = vi.fn();
    const customKeyboard = new Keyboard();
    customKeyboard.setErrorHandler(onError);

    customKeyboard.register(KEYS.escape, () => {
      throw error;
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onError).toHaveBeenCalledWith(error, "Keyboard handler failed.");
  });

  it("should register invalid key and call onError with warning", () => {
    const onError = vi.fn();
    const customKeyboard = new Keyboard({ onError });

    // @ts-expect-error - testing invalid runtime key
    const reg = customKeyboard.register("invalid-key", () => {});

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          '[Keyboard] Unrecognized key value: "invalid-key". Binding will still be registered but may not match standard browser event keys.',
      }),
      "Keyboard binding registered with warning.",
    );

    // Should return working registration
    expect(reg).toHaveProperty("unregister");
    expect(() => reg.unregister()).not.toThrow();
  });

  it("should ignore shift key check for single-character symbols and digits", () => {
    const handler = vi.fn();
    // register simple binding for "@"
    keyboard.register(KEYS.at, handler);

    // Dispatch "@" with Shift active (typical for US layout)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "@", shiftKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should ignore shift key for symbols in shortcut bindings when shift is not required", () => {
    const handler = vi.fn();
    keyboard.register({ key: KEYS.slash, modifiers: ["ctrl"] }, handler);

    // Dispatch Ctrl+Shift+/ (typical for German layout Ctrl+/)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true, shiftKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should respect shift key for symbols in shortcut bindings when shift is explicitly required", () => {
    const handler = vi.fn();
    keyboard.register({ key: KEYS.slash, modifiers: ["ctrl", "shift"] }, handler);

    // Dispatch Ctrl+/ without Shift
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true }));
    expect(handler).not.toHaveBeenCalled();

    // Dispatch Ctrl+Shift+/
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true, shiftKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should resolve mod/cmdOrCtrl modifier keys correctly based on platform", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    keyboard.register({ key: KEYS.k, modifiers: ["mod"] }, handler1);
    keyboard.register({ key: KEYS.j, modifiers: ["cmdOrCtrl"] }, handler2);

    // Since we mock/run in jsdom which is not Mac, mod should map to ctrl
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "K", ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "J", ctrlKey: true }));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("should ignore plain shortcuts inside input elements by default", () => {
    const handler = vi.fn();
    keyboard.register(KEYS.escape, handler);

    const input = document.createElement("input");
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("should not ignore shortcuts inside inputs if bypass modifiers are present", () => {
    const handler = vi.fn();
    keyboard.register({ key: KEYS.k, modifiers: ["ctrl"] }, handler);

    const input = document.createElement("input");
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "K", ctrlKey: true, bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(input);
  });

  it("should not ignore shortcuts inside inputs if ignoreInput is false", () => {
    const handler = vi.fn();
    keyboard.register(KEYS.escape, handler, { ignoreInput: false });

    const input = document.createElement("input");
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(input);
  });

  it("should preserve other bindings in scope when one is unregistered", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const reg1 = keyboard.register(KEYS.escape, handler1);
    const reg2 = keyboard.register(KEYS.enter, handler2);

    reg1.unregister();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(handler2).toHaveBeenCalledTimes(1);

    reg2.unregister();
  });

  it("should return false on matches when shortcut key does not match", () => {
    const handler = vi.fn();
    keyboard.register({ key: KEYS.k, modifiers: ["ctrl"] }, handler);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("should ignore shortcuts inside inputs nested inside shadow DOM", () => {
    const handler = vi.fn();
    keyboard.register(KEYS.escape, handler);

    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadowRoot.appendChild(input);
    document.body.appendChild(host);

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    vi.spyOn(event, "composedPath").mockReturnValue([input, shadowRoot, host, document.body, document]);

    host.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(host);
  });

  it("should register case-insensitive single-character keys", () => {
    const handler = vi.fn();
    // @ts-expect-error - testing uppercase register
    keyboard.register("K", handler);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "K" }));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should respect isMac override for modifier mapping", () => {
    const handlerMac = vi.fn();
    const handlerNonMac = vi.fn();

    const kbMac = new Keyboard({ isMac: true });
    const kbNonMac = new Keyboard({ isMac: false });

    kbMac.register({ key: KEYS.k, modifiers: ["mod"] }, handlerMac, { target: document });
    kbNonMac.register({ key: KEYS.k, modifiers: ["mod"] }, handlerNonMac, { target: document });

    // On Mac, mod maps to metaKey
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    expect(handlerMac).toHaveBeenCalledTimes(1);
    expect(handlerNonMac).not.toHaveBeenCalled();

    // On Non-Mac, mod maps to ctrlKey
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    expect(handlerMac).toHaveBeenCalledTimes(1);
    expect(handlerNonMac).toHaveBeenCalledTimes(1);

    kbMac.clear();
    kbNonMac.clear();
  });

  it("should register unrecognized keys with a warning and trigger matches", () => {
    const onError = vi.fn();
    const customKeyboard = new Keyboard({ onError });
    const handler = vi.fn();

    // @ts-expect-error - testing arbitrary unrecognized key
    customKeyboard.register("MyCustomKey", handler);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('[Keyboard] Unrecognized key value: "MyCustomKey"'),
      }),
      "Keyboard binding registered with warning.",
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "MyCustomKey" }));
    expect(handler).toHaveBeenCalledTimes(1);

    customKeyboard.clear();
  });
});
