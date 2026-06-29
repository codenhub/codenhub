import { afterEach, describe, expect, it, vi } from "vitest";

import { defineComponent } from "./component.js";
import { html } from "./html.js";
import { reg, uniqueTag } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// defineComponent — basic definition
// ---------------------------------------------------------------------------

describe("defineComponent", () => {
  it("shouldReturnDefinitionWithoutRegisteringElement", () => {
    const tag = uniqueTag("def-test");
    const component = defineComponent(tag, {
      properties: { title: String },
      render() {
        return html`
          <h1>${this.title}</h1>
        `;
      },
    });

    expect(component.tagName).toBe(tag);
    expect(customElements.get(tag)).toBeUndefined();
  });

  it("shouldExposeCreateFactory", () => {
    const tag = uniqueTag("factory-test");
    const component = defineComponent(tag, {
      render() {
        return "<p>hi</p>";
      },
    });
    reg(component);

    const el = component.create();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("shouldApplyInitialPropsViaCreate", () => {
    const tag = uniqueTag("init-props");
    const component = defineComponent(tag, {
      properties: { label: String },
      render() {
        return html`
          <span>${this.label}</span>
        `;
      },
    });
    reg(component);

    const el = component.create({ label: "hello" });
    document.body.appendChild(el);

    expect(el.innerHTML).toContain("<span>hello</span>");
  });
});

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Render scheduling — disconnect race
// ---------------------------------------------------------------------------

describe("render scheduling", () => {
  it("shouldNotCallOnUpdateAfterDisconnectDuringMicrotaskFlush", async () => {
    const tag = uniqueTag("disconnect-race");
    const updateSpy = vi.fn();
    const component = defineComponent(tag, {
      properties: { count: Number },
      onUpdate: updateSpy,
      render() {
        return `<p>${this.count}</p>`;
      },
    });
    reg(component);

    const el = component.create({ count: 0 });
    document.body.appendChild(el);
    // onUpdate fires once on initial render
    expect(updateSpy).toHaveBeenCalledOnce();

    // Trigger a re-render schedule, then immediately disconnect before flush
    (el as unknown as Record<string, unknown>)["count"] = 1;
    document.body.removeChild(el);
    await Promise.resolve();

    // onUpdate must NOT have been called again on disconnected element
    expect(updateSpy).toHaveBeenCalledOnce();
  });
});

describe("lifecycle hooks", () => {
  it("shouldCallOnMountAfterConnectedToDOM", () => {
    const tag = uniqueTag("lifecycle-mount");
    const mountSpy = vi.fn();
    const component = defineComponent(tag, {
      onMount: mountSpy,
      render() {
        return "<p>x</p>";
      },
    });
    reg(component);

    const el = component.create();
    expect(mountSpy).not.toHaveBeenCalled();
    document.body.appendChild(el);
    expect(mountSpy).toHaveBeenCalledOnce();
  });

  it("shouldCallOnUpdateAfterEachRender", () => {
    const tag = uniqueTag("lifecycle-update");
    const updateSpy = vi.fn();
    const component = defineComponent(tag, {
      onUpdate: updateSpy,
      render() {
        return "<p>x</p>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);
    // onUpdate fires once on initial render
    expect(updateSpy).toHaveBeenCalledOnce();
  });

  it("shouldCallOnUnmountAfterRemovedFromDOM", () => {
    const tag = uniqueTag("lifecycle-unmount");
    const unmountSpy = vi.fn();
    const component = defineComponent(tag, {
      onUnmount: unmountSpy,
      render() {
        return "<p>x</p>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);
    document.body.removeChild(el);
    expect(unmountSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Reactive properties
// ---------------------------------------------------------------------------

describe("reactive properties", () => {
  it("shouldReRenderAfterPropertyChangeInNextMicrotask", async () => {
    const tag = uniqueTag("reactive");
    const component = defineComponent(tag, {
      properties: { count: Number },
      render() {
        return html`
          <span>${this.count}</span>
        `;
      },
    });
    reg(component);

    const el = component.create({ count: 0 });
    document.body.appendChild(el);
    expect(el.innerHTML).toContain("<span>0</span>");

    (el as unknown as { count: number }).count = 5;
    await Promise.resolve();

    expect(el.innerHTML).toContain("<span>5</span>");
  });

  it("shouldCastStringPropertyToNumber", () => {
    const tag = uniqueTag("cast-num");
    const component = defineComponent(tag, {
      properties: { value: Number },
      render() {
        return "<p></p>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);
    (el as unknown as Record<string, unknown>)["value"] = "42";

    expect((el as unknown as Record<string, unknown>)["value"]).toBe(42);
  });

  it("shouldCastStringTrueToBoolean", () => {
    const tag = uniqueTag("cast-bool");
    const component = defineComponent(tag, {
      properties: { active: Boolean },
      render() {
        return "<p></p>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);
    (el as unknown as Record<string, unknown>)["active"] = "true";

    expect((el as unknown as Record<string, unknown>)["active"]).toBe(true);
  });

  it("shouldThrowErrorOnInvalidJSONParsing", () => {
    const tag = uniqueTag("cast-json-fail");
    const component = defineComponent(tag, {
      properties: { data: Object },
      render() {
        return "<p></p>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(() => {
      (el as unknown as Record<string, unknown>)["data"] = "{invalid json";
    }).toThrow("Failed to parse JSON value for property of type Object");
  });

  it("shouldCastBooleanAttributesCorrectly", () => {
    const tag = uniqueTag("cast-bool-attr");
    const component = defineComponent(tag, {
      properties: { active: Boolean },
      render() {
        return "<p></p>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);

    el.setAttribute("active", "");
    expect((el as unknown as Record<string, unknown>)["active"]).toBe(true);

    el.setAttribute("active", "false");
    expect((el as unknown as Record<string, unknown>)["active"]).toBe(false);

    el.setAttribute("active", "true");
    expect((el as unknown as Record<string, unknown>)["active"]).toBe(true);

    el.removeAttribute("active");
    expect((el as unknown as Record<string, unknown>)["active"]).toBe(false);
  });

  it("shouldCastEmptyStringToNaNForNumber", () => {
    const tag = uniqueTag("cast-num-empty");
    const component = defineComponent(tag, {
      properties: { value: Number },
      render() {
        return "<p></p>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);

    (el as unknown as Record<string, unknown>)["value"] = "";
    expect(Number.isNaN((el as unknown as Record<string, unknown>)["value"])).toBe(true);

    (el as unknown as Record<string, unknown>)["value"] = "   ";
    expect(Number.isNaN((el as unknown as Record<string, unknown>)["value"])).toBe(true);
  });

  it("shouldNotScheduleRenderWhenValueUnchanged", async () => {
    const tag = uniqueTag("no-rerender");
    let renderCount = 0;
    const component = defineComponent(tag, {
      properties: { label: String },
      render() {
        renderCount++;
        return html`
          <p>${this.label}</p>
        `;
      },
    });
    reg(component);

    const el = component.create({ label: "same" });
    document.body.appendChild(el);
    const countAfterMount = renderCount;

    (el as unknown as Record<string, unknown>)["label"] = "same";
    await Promise.resolve();

    expect(renderCount).toBe(countAfterMount);
  });
});

// ---------------------------------------------------------------------------
// attributeChangedCallback
// ---------------------------------------------------------------------------

describe("attributeChangedCallback", () => {
  it("shouldSyncAttributeChangeToProperty", async () => {
    const tag = uniqueTag("attr-sync");
    const component = defineComponent(tag, {
      properties: { name: String },
      render() {
        return html`
          <p>${this.name}</p>
        `;
      },
    });
    reg(component);

    const el = component.create({ name: "Alice" });
    document.body.appendChild(el);

    el.setAttribute("name", "Bob");
    await Promise.resolve();

    expect(el.innerHTML).toContain("<p>Bob</p>");
  });
});

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

describe("methods", () => {
  it("shouldBindMethodsToElementInstance", () => {
    const tag = uniqueTag("methods");
    const clickSpy = vi.fn();
    const component = defineComponent(tag, {
      properties: { clicks: Number },
      onUpdate() {
        this.querySelector("button")?.addEventListener(
          "click",
          (this as unknown as { increment: () => void }).increment,
        );
      },
      render() {
        return html`
          <button>Clicks: ${this.clicks}</button>
        `;
      },
      methods: {
        increment() {
          clickSpy();
          this.clicks = (this.clicks ?? 0) + 1;
        },
      },
    });
    reg(component);

    const el = component.create({ clicks: 0 });
    document.body.appendChild(el);

    el.querySelector("button")?.click();
    expect(clickSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Shadow DOM
// ---------------------------------------------------------------------------

describe("Shadow DOM", () => {
  it("shouldAttachShadowRootWhenHasShadowIsTrue", () => {
    const tag = uniqueTag("shadow-test");
    const component = defineComponent(tag, {
      hasShadow: true,
      render() {
        return "<p>shadow</p>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot!.innerHTML).toContain("<p>shadow</p>");
  });

  it("shouldInjectStyleTagIntoShadowRoot", () => {
    const tag = uniqueTag("shadow-style");
    const component = defineComponent(tag, {
      hasShadow: true,
      styles: ".card { color: red; }",
      render() {
        return "<div class='card'>hi</div>";
      },
    });
    reg(component);

    const el = component.create();
    document.body.appendChild(el);

    const style = el.shadowRoot!.querySelector("style");
    expect(style?.textContent).toContain(".card { color: red; }");
  });
});
