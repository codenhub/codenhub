// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bindTabs } from "./tabs";

function renderTabs(): HTMLElement {
  document.body.innerHTML = `
    <div id="root" role="tablist">
      <button aria-controls="panel-a" aria-selected="true" id="tab-a" role="tab" tabindex="0">A</button>
      <button aria-controls="panel-b" aria-selected="false" id="tab-b" role="tab" tabindex="-1">B</button>
      <button aria-controls="panel-c" aria-selected="false" id="tab-c" role="tab" tabindex="-1">C</button>
    </div>
    <div id="panel-a" role="tabpanel"></div>
    <div hidden id="panel-b" role="tabpanel"></div>
    <div hidden id="panel-c" role="tabpanel"></div>
  `;
  return document.getElementById("root") as HTMLElement;
}

const tab = (id: string): HTMLButtonElement => document.getElementById(`tab-${id}`) as HTMLButtonElement;

function press(id: string, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init });
  tab(id).dispatchEvent(event);
  return event;
}

function expectSelected(id: string): void {
  for (const candidate of ["a", "b", "c"]) {
    const isSelected = candidate === id;
    expect(tab(candidate).getAttribute("aria-selected")).toBe(String(isSelected));
    expect(tab(candidate).tabIndex).toBe(isSelected ? 0 : -1);
    expect(document.getElementById(`panel-${candidate}`)?.hidden).toBe(!isSelected);
  }
}

describe("bindTabs", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = renderTabs();
  });

  it("selects a clicked tab and shows only its panel", () => {
    const onSelect = vi.fn();
    bindTabs(root, onSelect);

    tab("b").click();

    expectSelected("b");
    expect(onSelect).toHaveBeenCalledWith(tab("b"));
  });

  it("moves with the arrow keys, wrapping at both ends, and focuses the new tab", () => {
    bindTabs(root);

    press("a", "ArrowLeft");
    expectSelected("c");
    expect(document.activeElement).toBe(tab("c"));

    press("c", "ArrowRight");
    expectSelected("a");
  });

  it("jumps to the first and last tab with Home and End", () => {
    bindTabs(root);

    press("a", "End");
    expectSelected("c");

    press("c", "Home");
    expectSelected("a");
    expect(document.activeElement).toBe(tab("a"));
  });

  it("leaves arrow keys with a modifier to the browser", () => {
    bindTabs(root);

    const event = press("a", "ArrowRight", { altKey: true });

    expectSelected("a");
    expect(event.defaultPrevented).toBe(false);
  });

  it("returns a function that selects a tab without moving focus or reporting it", () => {
    const onSelect = vi.fn();
    const show = bindTabs(root, onSelect);

    show(tab("b"));

    expectSelected("b");
    expect(document.activeElement).not.toBe(tab("b"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
