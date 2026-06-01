// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toast } from "./core";

interface MockAnimation {
  target: HTMLDivElement;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  finished: Promise<void>;
}

let animations: MockAnimation[] = [];

type ToastOverrides = Partial<ConstructorParameters<typeof Toast>[0]>;

function makeToast(overrides: ToastOverrides = {}) {
  return new Toast({ message: "test", autoDismiss: false, ...overrides });
}

function createRect(top: number): DOMRect {
  return {
    bottom: top + 40,
    height: 40,
    left: 0,
    right: 160,
    top,
    width: 160,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function getAnimationCalls(target: HTMLDivElement): MockAnimation[] {
  return animations.filter((animation) => animation.target === target);
}

function assertToastLifecycleContract(toast: Toast): void {
  toast.onShow(() => undefined);
  toast.onShown(() => undefined);
  toast.onHide(() => undefined);
  toast.onHidden(() => undefined);
  // @ts-expect-error Lifecycle consumers use dedicated methods, not raw event names.
  toast.subscribe("show", () => undefined);
}
void assertToastLifecycleContract;

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

describe("Toast constructor", () => {
  it("should throw when neither message nor content are provided", () => {
    expect(() => new Toast({ autoDismiss: false } as unknown as ConstructorParameters<typeof Toast>[0])).toThrow(
      "Toast requires a non-empty message or content.",
    );
  });

  it("should throw when the message is blank and content is missing", () => {
    expect(() => new Toast({ message: "   ", autoDismiss: false })).toThrow(
      "Toast requires a non-empty message or content.",
    );
  });

  it("should throw when string content is blank", () => {
    expect(() => new Toast({ content: "   ", autoDismiss: false })).toThrow(
      "Toast content must not be an empty string.",
    );
  });

  it("should validate content factories during construction", () => {
    const content = vi.fn(() => "   ");

    expect(() => new Toast({ content, autoDismiss: false })).toThrow("Toast content must not be an empty string.");
    expect(content).toHaveBeenCalledOnce();
  });

  it("should throw when duration is negative", () => {
    expect(() => new Toast({ message: "Saved", duration: -1, autoDismiss: false })).toThrow(
      "Toast duration must be a finite number greater than or equal to 0.",
    );
  });

  it("should throw when duration is not finite", () => {
    expect(() => new Toast({ message: "Saved", duration: Number.NaN, autoDismiss: false })).toThrow(
      "Toast duration must be a finite number greater than or equal to 0.",
    );
  });
});

describe("Toast.show", () => {
  it("should append an element to the DOM", () => {
    makeToast().show();
    expect(document.body.querySelector("[role='status']")).not.toBeNull();
  });

  it("should be a no-op when already visible", () => {
    const toast = makeToast();
    toast.show();
    toast.show();
    expect(document.body.querySelectorAll("[role='status']")).toHaveLength(1);
  });

  it("should be a no-op while hiding", () => {
    const toast = makeToast();
    toast.show();
    toast.hide();
    toast.show(); // called while animation is in progress
    expect(document.body.querySelectorAll("[role='status']")).toHaveLength(1);
  });

  it("should notify show subscribers on the toast instance", () => {
    const toast = makeToast();
    const onShow = vi.fn();
    toast.onShow(onShow);
    toast.show();
    expect(onShow).toHaveBeenCalledOnce();
  });

  it("should return an unsubscribe function from subscriptions", () => {
    const toast = makeToast();
    const onShow = vi.fn();
    const unsubscribe = toast.onShow(onShow);

    unsubscribe();
    toast.show();

    expect(onShow).not.toHaveBeenCalled();
  });

  it("should notify lifecycle subscribers in order", () => {
    const toast = makeToast();
    const events: string[] = [];

    toast.onShow(() => events.push("show"));
    toast.onShown(() => events.push("shown"));
    toast.onHide(() => events.push("hide"));
    toast.onHidden(() => events.push("hidden"));

    toast.show();
    animations[0]?.onfinish?.();
    toast.hide();
    animations[1]?.onfinish?.();

    expect(events).toEqual(["show", "shown", "hide", "hidden"]);
  });

  it("should animate existing toasts into their new stack positions", () => {
    const firstToast = makeToast({ message: "first" });
    const secondToast = makeToast({ message: "second" });

    firstToast.show();

    const firstElement = document.body.querySelector("[role='status']");

    if (!(firstElement instanceof HTMLDivElement)) {
      throw new Error("Expected first toast element to render.");
    }

    firstElement.getBoundingClientRect = vi
      .fn()
      .mockReturnValueOnce(createRect(16))
      .mockReturnValueOnce(createRect(64));

    secondToast.show();

    expect(getAnimationCalls(firstElement)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyframes: [{ translate: "0 -48px" }, { translate: "0 0" }],
          options: expect.objectContaining({ duration: 400, easing: "ease-in-out", fill: "both" }),
        }),
      ]),
    );
  });

  it("should animate a new toast from outside the stack", () => {
    const firstToast = makeToast({ message: "first" });
    const secondToast = makeToast({ message: "second" });

    firstToast.show();

    const firstElement = document.body.querySelector("[role='status']");

    if (!(firstElement instanceof HTMLDivElement)) {
      throw new Error("Expected first toast element to render.");
    }

    firstElement.getBoundingClientRect = vi
      .fn()
      .mockReturnValueOnce(createRect(16))
      .mockReturnValueOnce(createRect(64));

    secondToast.show();

    const secondElement = [...document.body.querySelectorAll("[role='status']")].find(
      (element) => element.textContent === "second",
    );

    if (!(secondElement instanceof HTMLDivElement)) {
      throw new Error("Expected second toast element to render.");
    }

    expect(getAnimationCalls(secondElement)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyframes: [{ translate: "0 -48px" }, { translate: "0 0" }],
          options: expect.objectContaining({ duration: 400, easing: "ease-in-out", fill: "both" }),
        }),
      ]),
    );
  });

  it("should keep stack movement separate from exit transforms", () => {
    const firstToast = makeToast({ message: "first" });
    const secondToast = makeToast({ message: "second" });

    firstToast.show();

    const firstElement = document.body.querySelector("[role='status']");

    if (!(firstElement instanceof HTMLDivElement)) {
      throw new Error("Expected first toast element to render.");
    }

    firstElement.getBoundingClientRect = vi
      .fn()
      .mockReturnValueOnce(createRect(16))
      .mockReturnValueOnce(createRect(64));

    secondToast.show();
    firstToast.hide();

    expect(getAnimationCalls(firstElement)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyframes: [{ translate: "0 -48px" }, { translate: "0 0" }],
          options: expect.objectContaining({ duration: 400, easing: "ease-in-out", fill: "both" }),
        }),
        expect.objectContaining({
          keyframes: [
            { transform: "translateX(0)", opacity: 1 },
            { transform: "translateX(100%)", opacity: 0 },
          ],
          options: expect.objectContaining({ duration: 400, easing: "ease-in-out", fill: "both" }),
        }),
      ]),
    );
  });

  it("should not append the element when hidden during show notification", () => {
    const toast = makeToast();

    toast.onShow(() => {
      toast.hide();
    });

    toast.show();

    expect(document.body.querySelector("[role='status']")).toBeNull();
  });

  it("should not dispatch toast:shown after hide starts before enter animation finishes", () => {
    const toast = makeToast();
    const onShown = vi.fn();

    toast.onShown(onShown);

    toast.show();
    toast.hide();

    animations[0]?.onfinish?.();

    expect(onShown).not.toHaveBeenCalled();
  });

  it("should auto-dismiss after the configured duration", () => {
    vi.useFakeTimers();
    const toast = makeToast({ autoDismiss: true, duration: 1000 });
    toast.show();
    vi.advanceTimersByTime(1000);
    // hide() transitions to isHiding — the element is not yet removed (animation),
    // but a second show() should be blocked.
    expect(() => toast.show()).not.toThrow();
    vi.useRealTimers();
  });

  it("should start the auto-dismiss timer after the enter animation finishes", () => {
    vi.useFakeTimers();

    const toast = makeToast({ autoDismiss: true, duration: 1000 });
    const onHide = vi.fn();

    toast.onHide(onHide);
    toast.show();

    vi.advanceTimersByTime(1000);
    expect(onHide).not.toHaveBeenCalled();

    animations[0]?.onfinish?.();

    vi.advanceTimersByTime(999);
    expect(onHide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onHide).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it("should fail before making room for an invalid toast", () => {
    const toasts = Array.from({ length: 5 }, (_, index) => makeToast({ message: `toast ${index + 1}` }));

    toasts.forEach((toast) => toast.show());

    expect(() => new Toast({ message: "   ", autoDismiss: false })).toThrow(
      "Toast requires a non-empty message or content.",
    );
    expect(document.body.querySelectorAll("[role='status']")).toHaveLength(5);
    expect(document.body.textContent).toContain("toast 1");
  });
});

describe("Toast.hide", () => {
  it("should be a no-op when not visible", () => {
    const toast = makeToast();
    expect(() => toast.hide()).not.toThrow();
  });

  it("should ignore later mutations to the caller options object", () => {
    const options: ConstructorParameters<typeof Toast>[0] = {
      message: "test",
      autoDismiss: false,
      position: "top-left",
    };
    const toast = new Toast(options);

    toast.show();
    options.position = "bottom-right";
    toast.hide();
    animations[1]?.onfinish?.();

    expect(document.getElementById("global-toast-container-top-left")?.children).toHaveLength(0);
    expect(document.body.querySelector("[role='status']")).toBeNull();
  });

  it("should notify hide subscribers immediately while the element is still in the DOM", () => {
    const toast = makeToast();
    toast.show();

    const onHide = vi.fn();
    toast.onHide(onHide);
    toast.hide();

    expect(onHide).toHaveBeenCalledOnce();
    // element is still present mid-animation
    expect(document.body.querySelector("[role='status']")).not.toBeNull();
  });

  it("should be a no-op when called a second time while already hiding", () => {
    const toast = makeToast();
    toast.show();
    toast.hide();

    const onHide = vi.fn();
    toast.onHide(onHide);
    toast.hide();

    expect(onHide).not.toHaveBeenCalled();
  });

  it("should cancel the auto-dismiss timeout when called early", () => {
    vi.useFakeTimers();
    const toast = makeToast({ autoDismiss: true, duration: 5000 });
    toast.show();

    const onHide = vi.fn();
    toast.onHide(onHide);

    toast.hide(); // manual dismiss before timeout fires
    vi.advanceTimersByTime(5000);

    // hide should have fired exactly once — not again when the timeout would have elapsed
    expect(onHide).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("should remove the element when animations are unavailable", () => {
    const toast = makeToast();

    Reflect.deleteProperty(HTMLElement.prototype, "animate");

    expect(() => toast.show()).not.toThrow();
    expect(document.body.querySelector("[role='status']")).not.toBeNull();

    expect(() => toast.hide()).not.toThrow();

    expect(document.body.querySelector("[role='status']")).toBeNull();
  });

  it("should complete exit cleanup when the exit animation is canceled", () => {
    const toast = makeToast();
    const onHidden = vi.fn();

    toast.onHidden(onHidden);
    toast.show();
    toast.hide();
    animations[1]?.oncancel?.();

    expect(onHidden).toHaveBeenCalledOnce();
    expect(document.body.querySelector("[role='status']")).toBeNull();
  });

  it("should wait for the oldest toast to leave before showing a new one beyond the limit", () => {
    const toasts = Array.from({ length: 6 }, (_, index) => makeToast({ message: `toast ${index + 1}` }));

    toasts.slice(0, 5).forEach((toast) => toast.show());
    toasts[5]?.show();

    expect(document.body.querySelectorAll("[role='status']")).toHaveLength(5);
    expect(document.body.textContent).not.toContain("toast 6");

    animations[5]?.onfinish?.();

    const messages = [...document.body.querySelectorAll("[role='status']")].map((element) => element.textContent);

    expect(messages).toHaveLength(5);
    expect(messages).not.toContain("toast 1");
    expect(messages).toContain("toast 6");
  });

  it("should not show a queued toast after it is hidden before a slot opens", () => {
    const toasts = Array.from({ length: 6 }, (_, index) => makeToast({ message: `toast ${index + 1}` }));

    toasts.slice(0, 5).forEach((toast) => toast.show());
    toasts[5]?.show();
    toasts[5]?.hide();
    animations[5]?.onfinish?.();

    expect(document.body.textContent).not.toContain("toast 6");
  });

  it("should not dispatch lifecycle events on the DOM element", () => {
    const toast = makeToast();
    toast.show();

    const element = document.body.querySelector("[role='status']");
    const onDomHide = vi.fn();
    const onDomHidden = vi.fn();

    element?.addEventListener("toast:hide", onDomHide);
    element?.addEventListener("toast:hidden", onDomHidden);

    toast.hide();
    animations[1]?.onfinish?.();

    expect(onDomHide).not.toHaveBeenCalled();
    expect(onDomHidden).not.toHaveBeenCalled();
  });
});
