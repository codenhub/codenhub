import { afterEach, describe, expect, it, vi } from "vitest";

import { defineComponent } from "./component.js";
import { html } from "./html.js";
import { castToProps, registerComponent, generateUniqueTag } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// defineComponent — basic definition
// ---------------------------------------------------------------------------

describe("defineComponent", () => {
  it("shouldReturnDefinitionWithoutRegisteringElement", () => {
    const tag = generateUniqueTag("def-test");
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

  it("shouldThrowErrorWhenTagNameHasNoHyphen", () => {
    expect(() => {
      defineComponent("nohyphen", {
        render() {
          return "<p></p>";
        },
      });
    }).toThrow('Invalid custom element tag name: "nohyphen". Custom element tag names must contain a hyphen.');
  });

  it("shouldWarnWhenStylesDefinedWithoutHasShadow", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tag = generateUniqueTag("styles-warn");
    defineComponent(tag, {
      styles: "p { color: red; }",
      render() {
        return "<p></p>";
      },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      `Component "${tag}" declared styles but "hasShadow" is not enabled. Styles are only injected when hasShadow is true.`,
    );
    warnSpy.mockRestore();
  });

  it("shouldExposeCreateFactory", () => {
    const tag = generateUniqueTag("factory-test");
    const component = defineComponent(tag, {
      render() {
        return "<p>hi</p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("shouldApplyInitialPropsViaCreate", () => {
    const tag = generateUniqueTag("init-props");
    const component = defineComponent(tag, {
      properties: { label: String },
      render() {
        return html`
          <span>${this.label}</span>
        `;
      },
    });
    registerComponent(component);

    const el = component.create({ label: "hello" });
    document.body.appendChild(el);

    expect(el.innerHTML).toContain("<span>hello</span>");
  });

  it("shouldNotSetPropertiesWhenCreateCalledWithoutArgs", () => {
    const tag = generateUniqueTag("create-no-props");
    const component = defineComponent(tag, {
      properties: { label: String },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    // create() with no argument must not throw and must produce a valid element
    expect(() => {
      const el = component.create();
      document.body.appendChild(el);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

describe("lifecycle hooks", () => {
  it("shouldCallOnMountAfterConnectedToDOM", () => {
    const tag = generateUniqueTag("lifecycle-mount");
    const mountSpy = vi.fn();
    const component = defineComponent(tag, {
      onMount: mountSpy,
      render() {
        return "<p>x</p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    expect(mountSpy).not.toHaveBeenCalled();
    document.body.appendChild(el);
    expect(mountSpy).toHaveBeenCalledOnce();
  });

  it("shouldCallOnUpdateBeforeOnMountOnFirstConnect", () => {
    // Call order on first connect must be: render → onUpdate → onMount.
    // onMount consumers rely on DOM being populated; onUpdate must have
    // already run so the DOM is ready when onMount starts.
    const tag = generateUniqueTag("lifecycle-order");
    const callOrder: string[] = [];
    const component = defineComponent(tag, {
      onMount() {
        callOrder.push("onMount");
      },
      onUpdate() {
        callOrder.push("onUpdate");
      },
      render() {
        return "<p>x</p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(callOrder).toEqual(["onUpdate", "onMount"]);
  });

  it("shouldCallOnUpdateAfterEachRender", () => {
    const tag = generateUniqueTag("lifecycle-update");
    const updateSpy = vi.fn();
    const component = defineComponent(tag, {
      onUpdate: updateSpy,
      render() {
        return "<p>x</p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    // onUpdate fires once on initial render
    expect(updateSpy).toHaveBeenCalledOnce();
  });

  it("shouldCallOnUnmountAfterRemovedFromDOM", () => {
    const tag = generateUniqueTag("lifecycle-unmount");
    const unmountSpy = vi.fn();
    const component = defineComponent(tag, {
      onUnmount: unmountSpy,
      render() {
        return "<p>x</p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    document.body.removeChild(el);
    expect(unmountSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Render scheduling — disconnect race
// ---------------------------------------------------------------------------

describe("render scheduling", () => {
  it("shouldNotCallOnUpdateAfterDisconnectDuringMicrotaskFlush", async () => {
    const tag = generateUniqueTag("disconnect-race");
    const updateSpy = vi.fn();
    const component = defineComponent(tag, {
      properties: { count: Number },
      onUpdate: updateSpy,
      render() {
        return `<p>${this.count}</p>`;
      },
    });
    registerComponent(component);

    const el = component.create({ count: 0 });
    document.body.appendChild(el);
    // onUpdate fires once on initial render
    expect(updateSpy).toHaveBeenCalledOnce();

    // Trigger a re-render schedule, then immediately disconnect before flush
    castToProps<{ count: number }>(el).count = 1;
    document.body.removeChild(el);
    await Promise.resolve();

    // onUpdate must NOT have been called again on disconnected element
    expect(updateSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Reactive properties
// ---------------------------------------------------------------------------

describe("reactive properties", () => {
  it("shouldReRenderAfterPropertyChangeInNextMicrotask", async () => {
    const tag = generateUniqueTag("reactive");
    const component = defineComponent(tag, {
      properties: { count: Number },
      render() {
        return html`
          <span>${this.count}</span>
        `;
      },
    });
    registerComponent(component);

    const el = component.create({ count: 0 });
    document.body.appendChild(el);
    expect(el.innerHTML).toContain("<span>0</span>");

    castToProps<{ count: number }>(el).count = 5;
    await Promise.resolve();

    expect(el.innerHTML).toContain("<span>5</span>");
  });

  it("shouldCastStringPropertyToNumber", () => {
    const tag = generateUniqueTag("cast-num");
    const component = defineComponent(tag, {
      properties: { value: Number },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    castToProps<{ value: unknown }>(el).value = "42";

    expect(castToProps<{ value: number }>(el).value).toBe(42);
  });

  it("shouldCastStringTrueToBoolean", () => {
    const tag = generateUniqueTag("cast-bool");
    const component = defineComponent(tag, {
      properties: { active: Boolean },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    castToProps<{ active: unknown }>(el).active = "true";

    expect(castToProps<{ active: boolean }>(el).active).toBe(true);
  });

  it("shouldCastNullToFalseForBooleanProperty", () => {
    // null maps to false for Boolean properties, matching HTML attribute-removal
    // semantics (removeAttribute passes null to attributeChangedCallback).
    // This is intentional and documented — see README boolean casting rules.
    const tag = generateUniqueTag("cast-bool-null");
    const component = defineComponent(tag, {
      properties: { active: Boolean },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    castToProps<{ active: unknown }>(el).active = null;

    expect(castToProps<{ active: unknown }>(el).active).toBe(false);
  });

  it("shouldPassThroughUndefinedForAnyProperty", () => {
    // undefined means "not yet set" — it must not be coerced to any typed
    // value so callers can distinguish uninitialized from explicitly set.
    const tag = generateUniqueTag("cast-undefined");
    const component = defineComponent(tag, {
      properties: { value: Number },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    castToProps<{ value: unknown }>(el).value = undefined;

    expect(castToProps<{ value: unknown }>(el).value).toBeUndefined();
  });

  it("shouldThrowErrorOnInvalidJSONParsing", () => {
    const tag = generateUniqueTag("cast-json-fail");
    const component = defineComponent(tag, {
      properties: { data: Object },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(() => {
      castToProps<{ data: unknown }>(el).data = "{invalid json";
    }).toThrow("Failed to parse JSON value for property of type Object");
  });

  it("shouldCastBooleanAttributesCorrectly", () => {
    const tag = generateUniqueTag("cast-bool-attr");
    const component = defineComponent(tag, {
      properties: { active: Boolean },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    el.setAttribute("active", "");
    expect(castToProps<{ active: boolean }>(el).active).toBe(true);

    el.setAttribute("active", "false");
    expect(castToProps<{ active: boolean }>(el).active).toBe(false);

    el.setAttribute("active", "true");
    expect(castToProps<{ active: boolean }>(el).active).toBe(true);

    el.removeAttribute("active");
    expect(castToProps<{ active: boolean }>(el).active).toBe(false);
  });

  it("shouldCastEmptyStringToNaNForNumber", () => {
    const tag = generateUniqueTag("cast-num-empty");
    const component = defineComponent(tag, {
      properties: { value: Number },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    castToProps<{ value: unknown }>(el).value = "";
    expect(Number.isNaN(castToProps<{ value: number }>(el).value)).toBe(true);

    castToProps<{ value: unknown }>(el).value = "   ";
    expect(Number.isNaN(castToProps<{ value: number }>(el).value)).toBe(true);
  });

  it("shouldNotScheduleRenderWhenValueUnchanged", async () => {
    const tag = generateUniqueTag("no-rerender");
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
    registerComponent(component);

    const el = component.create({ label: "same" });
    document.body.appendChild(el);
    const countAfterMount = renderCount;

    castToProps<{ label: string }>(el).label = "same";
    await Promise.resolve();

    expect(renderCount).toBe(countAfterMount);
  });
});

// ---------------------------------------------------------------------------
// attributeChangedCallback
// ---------------------------------------------------------------------------

describe("attributeChangedCallback", () => {
  it("shouldSyncAttributeChangeToProperty", async () => {
    const tag = generateUniqueTag("attr-sync");
    const component = defineComponent(tag, {
      properties: { name: String },
      render() {
        return html`
          <p>${this.name}</p>
        `;
      },
    });
    registerComponent(component);

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
    const tag = generateUniqueTag("methods");
    const clickSpy = vi.fn();
    const component = defineComponent(tag, {
      properties: { clicks: Number },
      onUpdate() {
        this.querySelector("button")?.addEventListener("click", castToProps<{ increment: () => void }>(this).increment);
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
    registerComponent(component);

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
    const tag = generateUniqueTag("shadow-test");
    const component = defineComponent(tag, {
      hasShadow: true,
      render() {
        return "<p>shadow</p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot!.innerHTML).toContain("<p>shadow</p>");
  });

  it("shouldInjectStyleTagIntoShadowRoot", () => {
    const tag = generateUniqueTag("shadow-style");
    const component = defineComponent(tag, {
      hasShadow: true,
      styles: ".card { color: red; }",
      render() {
        return "<div class='card'>hi</div>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    const style = el.shadowRoot!.querySelector("style");
    expect(style?.textContent).toContain(".card { color: red; }");
  });

  it("shouldThrowErrorWhenShadowRootContentWrapperIsMissing", () => {
    const tag = generateUniqueTag("shadow-missing");
    const component = defineComponent(tag, {
      hasShadow: true,
      render() {
        return "<p>shadow</p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    expect(el.shadowRoot).not.toBeNull();
    el.shadowRoot!.replaceChildren(); // clear wrapper

    expect(() => {
      castToProps<{ connectedCallback(): void }>(el).connectedCallback();
    }).toThrow(
      `Component "${tag}": shadow root content wrapper element is missing. Render aborted to prevent style node clobbering.`,
    );
  });

  it("shouldRenderCorrectlyWhenExtraElementAppendedToShadowRoot", async () => {
    const tag = generateUniqueTag("shadow-append");
    const component = defineComponent(tag, {
      hasShadow: true,
      properties: { value: String },
      render() {
        return html`
          <p>${this.value}</p>
        `;
      },
    });
    registerComponent(component);

    const el = component.create({ value: "initial" });
    document.body.appendChild(el);

    // Manually append another element to shadow root
    const extra = document.createElement("span");
    extra.textContent = "extra";
    el.shadowRoot!.appendChild(extra);

    // Trigger re-render
    castToProps<{ value: string }>(el).value = "updated";
    await Promise.resolve();

    // Verify rendering still succeeded and updated the innerHTML of wrapper
    expect(el.shadowRoot!.innerHTML).toContain("<p>updated</p>");
    expect(el.shadowRoot!.innerHTML).toContain("<span>extra</span>");
  });
});

// ---------------------------------------------------------------------------
// Coverage Gaps (Extra Verification)
// ---------------------------------------------------------------------------

describe("coverage gaps", () => {
  it("shouldCastNullToNullForNonBooleanProperty", () => {
    const tag = generateUniqueTag("gap-null");
    const component = defineComponent(tag, {
      properties: { label: String },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    castToProps<{ label: unknown }>(el).label = null;

    expect(castToProps<{ label: unknown }>(el).label).toBeNull();
  });

  it("shouldPassThroughObjectAndArrayWithoutParsing", () => {
    const tag = generateUniqueTag("gap-pass-obj");
    const component = defineComponent(tag, {
      properties: { data: Object },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    const originalObject = { value: 123 };
    castToProps<{ data: unknown }>(el).data = originalObject;

    expect(castToProps<{ data: unknown }>(el).data).toBe(originalObject);
  });

  it("shouldPassThroughUnsupportedPropertyConstructor", () => {
    const tag = generateUniqueTag("gap-unsupported");
    const component = defineComponent(tag, {
      properties: {
        // Date constructor is not in standard ComponentProperties but bypass typecheck for fallback coverage
        created: Date as unknown as StringConstructor,
      },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);
    const date = new Date();
    castToProps<{ created: unknown }>(el).created = date;

    expect(castToProps<{ created: unknown }>(el).created).toBe(date);
  });

  it("shouldNotChangePropertyOrTriggerRenderWhenAttributeValueIsSame", () => {
    const tag = generateUniqueTag("gap-attr-same");
    const component = defineComponent(tag, {
      properties: { name: String },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create({ name: "Alice" });
    document.body.appendChild(el);

    // Manually invoke callback with same value to hit same-value early return
    castToProps<{
      attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    }>(el).attributeChangedCallback("name", "Alice", "Alice");

    expect(castToProps<{ name: string }>(el).name).toBe("Alice");
  });

  it("shouldHandleNonErrorJSONParsingFailureGracefully", () => {
    const tag = generateUniqueTag("gap-json-non-error");
    const component = defineComponent(tag, {
      properties: { data: Object },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    // Spy/override JSON.parse to throw a string instead of an Error object
    const originalParse = JSON.parse;
    JSON.parse = () => {
      throw "raw string error";
    };

    try {
      expect(() => {
        castToProps<{ data: unknown }>(el).data = "{";
      }).toThrow("Failed to parse JSON value for property of type Object");
    } finally {
      JSON.parse = originalParse;
    }
  });

  it("shouldDoNothingWhenAttributeChangedCallbackCalledForUnmappedAttribute", () => {
    const tag = generateUniqueTag("gap-attr-unmapped");
    const component = defineComponent(tag, {
      properties: { name: String },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create({ name: "Alice" });
    document.body.appendChild(el);

    // Call attributeChangedCallback for an unmapped attribute name
    expect(() => {
      castToProps<{
        attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
      }>(el).attributeChangedCallback("unmapped", null, "value");
    }).not.toThrow();

    expect(castToProps<{ name: string }>(el).name).toBe("Alice");
  });
});
