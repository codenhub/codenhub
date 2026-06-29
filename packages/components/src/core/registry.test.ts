import { describe, expect, it } from "vitest";

import { defineComponent } from "./component.js";
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
});
