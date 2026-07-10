import { vi } from "vitest";

// Shared Vitest test utilities for @codenhub/toast.
export interface MockAnimation {
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
}

export let animations: MockAnimation[] = [];

export function flushAnimations(): void {
  const pending = animations;
  animations = [];
  pending.forEach((a) => a.onfinish?.());
}

export function installAnimateMock(): void {
  animations = [];
  HTMLElement.prototype.animate = vi.fn().mockImplementation(() => {
    const anim: MockAnimation = { onfinish: null, oncancel: null };
    animations.push(anim);
    return anim as unknown as Animation;
  });
}

export function installDialogMocks(): void {
  HTMLDialogElement.prototype.showModal = vi.fn().mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn().mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
}

export function mockBackdropRect(dialog: HTMLDialogElement): void {
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
  } as DOMRect);
}

export function clickBackdrop(dialog: HTMLDialogElement): void {
  dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 50 }));
}
