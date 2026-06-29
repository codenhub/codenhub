import { describe, expect, it } from "vitest";

import { defineComponent } from "./component.js";
import { registerComponents } from "./registry.js";
import type { ComponentDefinition, ComponentProperties } from "./types.js";

let tagCounter = 0;
function uniqueTag(base: string): string {
  return `${base}-${++tagCounter}`;
}

function reg(component: unknown): void {
  registerComponents([component as ComponentDefinition<ComponentProperties, unknown>]);
}

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
