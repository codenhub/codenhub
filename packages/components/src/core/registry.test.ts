import { describe, expect, it, vi } from "vitest";

import { defineComponent } from "./component.js";
import { registerComponents } from "./registry.js";
import { generateUniqueTag, registerComponent } from "./test-utils.js";

describe("registerComponents", () => {
  it("shouldRegisterElementInCustomElementsRegistry", () => {
    const tag = generateUniqueTag("reg-test");
    const component = defineComponent(tag, {
      render() {
        return "<p>ok</p>";
      },
    });

    registerComponent(component);
    expect(customElements.get(tag)).toBeDefined();
  });

  it("shouldNotThrowWhenRegisteredTwice", () => {
    const tag = generateUniqueTag("reg-dupe");
    const component = defineComponent(tag, {
      render() {
        return "<p>ok</p>";
      },
    });

    expect(() => {
      registerComponent(component);
      registerComponent(component);
    }).not.toThrow();
  });

  it("shouldBeNoOpWhenCustomElementsUnavailable", () => {
    // Simulates SSR or non-browser environments where customElements is absent.
    vi.stubGlobal("customElements", undefined);
    try {
      expect(() => {
        registerComponents([{ tagName: "ssr-no-op", elementClass: class extends HTMLElement {} }]);
      }).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
