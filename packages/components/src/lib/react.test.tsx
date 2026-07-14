// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defineComponent } from "../core/component/factory.js";
import { html } from "../core/html.js";
import { registerComponents } from "../core/registry.js";
import { createReactWrapper } from "./react.js";

const container = document.createElement("div");
document.body.appendChild(container);

afterEach(() => {
  container.innerHTML = "";
});

describe("React Wrapper", () => {
  it("should render component and sync props, events, and refs", async () => {
    // 1. Define custom component
    const TestEl = defineComponent("x-test-btn", {
      properties: {
        label: { type: String, default: "" },
        disabled: { type: Boolean, default: false },
      },
      events: {
        customclick: MouseEvent,
      },
      render() {
        return html`
          <button>${this.label}</button>
        `;
      },
    });

    registerComponents([TestEl]);

    // 2. Wrap with React wrapper
    const ReactTestBtn = createReactWrapper(TestEl);

    // 3. Setup test props and refs
    const clickSpy = vi.fn();
    const btnRef = createRef<HTMLElement>();

    // 4. Render using React
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ReactTestBtn
          ref={btnRef}
          label="Click Me"
          disabled={true}
          onCustomClick={clickSpy}
          id="my-btn"
          className="test-class"
        />,
      );
    });

    // 5. Assertions
    const element = container.querySelector("x-test-btn") as HTMLElement & Record<string, unknown>;
    expect(element).not.toBeNull();
    expect(element.label).toBe("Click Me");
    expect(element.disabled).toBe(true);
    expect(btnRef.current).toBe(element);

    // Check DOM attribute forwarding
    expect(element.getAttribute("id")).toBe("my-btn");
    expect(element.getAttribute("class")).toBe("test-class");

    // Check custom event listener
    await act(async () => {
      element.dispatchEvent(new CustomEvent("customclick", { detail: "hello" }));
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Cleanup
    await act(async () => {
      root.unmount();
    });
  });
});
