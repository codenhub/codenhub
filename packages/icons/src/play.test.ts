import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindIconPlayback, playIcon } from "./play.js";

// Browser boundaries only: Chrome verification exercises actual rendering and event delegation.
class TestElement extends EventTarget {
  children: TestElement[] = [];
  parentElement: TestElement | null = null;
  localName = "i";
  namespaceURI = "http://www.w3.org/1999/xhtml";
  className = "ic-on-hover";
  history: string[] = [];
  isFocusVisible = false;
  properties = new Map<string, string>();
  computed = new Map([["--ic-mask", 'url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")']]);
  style = {
    setProperty: (name: string, value: string) => {
      this.history.push(`${name}=${value}`);
      this.properties.set(name, value);
    },
    removeProperty: (name: string) => {
      this.history.push(`-${name}`);
      this.properties.delete(name);
    },
    getPropertyPriority: () => "",
    getPropertyValue: (name: string) => this.properties.get(name) ?? "",
  };
  ownerDocument = {
    defaultView: {
      getComputedStyle: () => ({
        get animationName() {
          return "flushed";
        },
        getPropertyValue: (name: string) => this.properties.get(name) ?? this.computed.get(name) ?? "",
      }),
      matchMedia: () => ({ matches: isReduced }),
    },
  };
  getAttribute(name: string) {
    return name === "class" ? this.className : null;
  }
  append(child: TestElement) {
    this.children.push(child);
    child.parentElement = this;
  }
  contains(target: unknown): boolean {
    return this === target || this.children.some((child) => child.contains(target));
  }
  matches(selector: string): boolean {
    return selector === ":focus-visible" ? this.isFocusVisible : this.className.split(" ").includes(selector.slice(1));
  }
  querySelectorAll(selector: string): TestElement[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}
let isReduced = false;
const asElement = (element: TestElement) => element as unknown as Element;
function dispatch(root: TestElement, type: string, target: TestElement, relatedTarget: TestElement | null = null) {
  const event = new Event(type);
  Object.defineProperties(event, { target: { value: target }, relatedTarget: { value: relatedTarget } });
  root.dispatchEvent(event);
}
function fixture(prefix = "ic") {
  const root = new TestElement();
  root.className = "";
  const button = new TestElement();
  button.className = "";
  root.append(button);
  const icon = new TestElement();
  icon.className = `${prefix}-on-hover`;
  button.append(icon);
  const label = new TestElement();
  label.className = "";
  button.append(label);
  return { root, button, icon, label };
}
beforeEach(() => {
  isReduced = false;
  vi.stubGlobal("Element", TestElement);
});
afterEach(() => vi.unstubAllGlobals());

describe("playIcon", () => {
  it("gives every replay a fresh URL without changing the encoded SVG or fragment", () => {
    const icon = new TestElement();
    icon.computed.set("--ic-mask", 'url("data:image/svg+xml;n=old,%3Csvg%3E#part")');
    playIcon(asElement(icon));
    const first = icon.style.getPropertyValue("--ic-mask");
    expect(first).toMatch(/^url\("data:image\/svg\+xml;n=\d+,%3Csvg%3E#part"\)$/);
    playIcon(asElement(icon));
    expect(icon.style.getPropertyValue("--ic-mask")).not.toBe(first);
    expect(icon.style.getPropertyValue("--ic-mask").match(/;n=/g)).toHaveLength(1);
  });
  it("reads and overrides only the configured prefix", () => {
    const icon = new TestElement();
    icon.computed.set("--ux-mask", icon.computed.get("--ic-mask")!);
    playIcon(asElement(icon), { prefix: "ux" });
    expect(icon.style.getPropertyValue("--ux-mask")).toContain(";n=");
    expect(icon.style.getPropertyValue("--ic-mask")).toBe("");
  });
  it("resets an inline SVG timeline", () => {
    const icon = new TestElement();
    icon.localName = "svg";
    icon.namespaceURI = "http://www.w3.org/2000/svg";
    const setCurrentTime = vi.fn();
    Object.assign(icon, { setCurrentTime });
    playIcon(asElement(icon));
    expect(setCurrentTime).toHaveBeenCalledWith(0);
    expect(icon.properties.size).toBe(0);
  });
  it.each(["", "none", 'url("https://example.test/icon.svg")'])("ignores non-SVG-data masks %s", (mask) => {
    const icon = new TestElement();
    icon.computed.set("--ic-mask", mask);
    playIcon(asElement(icon));
    expect(icon.properties.size).toBe(0);
  });
  it("does not replay under reduced motion", () => {
    isReduced = true;
    const icon = new TestElement();
    icon.className = "ic-anim-beat";
    playIcon(asElement(icon));
    expect(icon.history).toEqual([]);
  });
  it("restarts glyph motion of the configured prefix and leaves no animation override", () => {
    const icon = new TestElement();
    icon.className = "ux-heart ux-anim-beat";
    icon.computed.clear();
    playIcon(asElement(icon), { prefix: "ux" });
    expect(icon.history).toEqual(["animation-name=none", "-animation-name"]);
    expect(icon.properties.size).toBe(0);
  });
  it("restores an inline animation name after restarting glyph motion", () => {
    const icon = new TestElement();
    icon.className = "ic-anim-spin";
    icon.computed.clear();
    icon.properties.set("animation-name", "custom");
    playIcon(asElement(icon));
    expect(icon.history).toEqual(["animation-name=none", "animation-name=custom"]);
  });
  it("leaves animations alone on an icon without a motion class of its prefix", () => {
    const icon = new TestElement();
    icon.className = "ux-anim-spin";
    icon.computed.clear();
    playIcon(asElement(icon));
    expect(icon.history).toEqual([]);
  });
});

describe("bindIconPlayback", () => {
  it("replays on parent hover, keeps the URL across child transitions, and removes it on leave", () => {
    const { root, button, icon, label } = fixture();
    const unbind = bindIconPlayback(asElement(root));
    dispatch(root, "pointerover", button);
    const first = icon.style.getPropertyValue("--ic-mask");
    expect(first).toContain(";n=");
    dispatch(root, "pointerout", button, icon);
    dispatch(root, "pointerover", icon, button);
    dispatch(root, "pointerout", icon, label);
    dispatch(root, "pointerover", label, icon);
    expect(icon.style.getPropertyValue("--ic-mask")).toBe(first);
    dispatch(root, "pointerout", label);
    expect(icon.style.getPropertyValue("--ic-mask")).toBe("");
    dispatch(root, "pointerover", icon);
    expect(icon.style.getPropertyValue("--ic-mask")).not.toBe(first);
    unbind();
    expect(icon.style.getPropertyValue("--ic-mask")).toBe("");
    dispatch(root, "pointerover", button);
    expect(icon.style.getPropertyValue("--ic-mask")).toBe("");
  });
  it("keeps playback until both hover and visible parent focus end", () => {
    const { root, button, icon } = fixture();
    const unbind = bindIconPlayback(asElement(root));
    button.isFocusVisible = true;
    dispatch(root, "focusin", button);
    const first = icon.style.getPropertyValue("--ic-mask");
    expect(first).toContain(";n=");
    dispatch(root, "pointerover", button);
    dispatch(root, "pointerout", button);
    expect(icon.style.getPropertyValue("--ic-mask")).toBe(first);
    button.isFocusVisible = false;
    dispatch(root, "focusout", button);
    expect(icon.style.getPropertyValue("--ic-mask")).toBe("");
    unbind();
  });
  it("ignores focus without focus-visible and focus on a more distant ancestor", () => {
    const { root, button, icon } = fixture();
    const unbind = bindIconPlayback(asElement(root));
    dispatch(root, "focusin", button);
    root.isFocusVisible = true;
    dispatch(root, "focusin", root);
    expect(icon.properties.size).toBe(0);
    unbind();
  });
  it("checks reduced motion at each trigger and discovers icons added after binding", () => {
    const { root, button } = fixture();
    const unbind = bindIconPlayback(asElement(root), { prefix: "ux" });
    const icon = new TestElement();
    icon.className = "ux-on-hover";
    icon.computed.set("--ux-mask", icon.computed.get("--ic-mask")!);
    button.append(icon);
    isReduced = true;
    dispatch(root, "pointerover", button);
    expect(icon.properties.size).toBe(0);
    dispatch(root, "pointerout", button);
    isReduced = false;
    dispatch(root, "pointerover", button);
    expect(icon.style.getPropertyValue("--ux-mask")).toContain(";n=");
    unbind();
  });
  it("plays icons at any depth under an ic-trigger ancestor, but only direct children of other elements", () => {
    const root = new TestElement();
    root.className = "";
    const card = new TestElement();
    card.className = "ic-trigger";
    root.append(card);
    const wrapper = new TestElement();
    wrapper.className = "";
    card.append(wrapper);
    const icon = new TestElement();
    wrapper.append(icon);
    const unbind = bindIconPlayback(asElement(root));
    dispatch(root, "pointerover", root);
    expect(icon.properties.size).toBe(0);
    dispatch(root, "pointerover", card, root);
    expect(icon.style.getPropertyValue("--ic-mask")).toContain(";n=");
    dispatch(root, "pointerout", card, root);
    expect(icon.properties.size).toBe(0);
    card.isFocusVisible = true;
    dispatch(root, "focusin", card);
    expect(icon.style.getPropertyValue("--ic-mask")).toContain(";n=");
    unbind();
  });
  it("includes the root icon itself and cleans detached active icons on unbind", () => {
    const icon = new TestElement();
    const unbind = bindIconPlayback(asElement(icon));
    dispatch(icon, "pointerover", icon);
    expect(icon.properties.size).toBe(1);
    unbind();
    expect(icon.properties.size).toBe(0);
  });
});
