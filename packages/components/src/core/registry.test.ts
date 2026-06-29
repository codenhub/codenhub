import { describe, expect, it } from "vitest";

import { defineComponent } from "./component.js";
import { reg, uniqueTag } from "./test-utils.js";

describe("registerComponents", () => {
  it("shouldRegisterElementInCustomElementsRegistry", () => {
    const tag = uniqueTag("reg-test");
    const component = defineComponent(tag, {
      render() {
        return "<p>ok</p>";
      },
    });

    reg(component);
    expect(customElements.get(tag)).toBeDefined();
  });

  it("shouldNotThrowWhenRegisteredTwice", () => {
    const tag = uniqueTag("reg-dupe");
    const component = defineComponent(tag, {
      render() {
        return "<p>ok</p>";
      },
    });

    expect(() => {
      reg(component);
      reg(component);
    }).not.toThrow();
  });
});
