import { afterEach, describe, expect, it, vi } from "vitest";

import { defineComponent } from "./component/index.js";
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
    }).toThrow('Invalid custom element tag name: "nohyphen".');
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

  it("shouldThrowErrorOnInvalidJSONParsingForObject", () => {
    const tag = generateUniqueTag("cast-json-fail-obj");
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

  it("shouldThrowErrorOnInvalidJSONParsingForArray", () => {
    const tag = generateUniqueTag("cast-json-fail-arr");
    const component = defineComponent(tag, {
      properties: { items: Array },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(() => {
      castToProps<{ items: unknown }>(el).items = "[invalid json";
    }).toThrow("Failed to parse JSON value for property of type Array");
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

    el.setAttribute("active", "active");
    expect(castToProps<{ active: boolean }>(el).active).toBe(true);

    el.setAttribute("active", "anything-else");
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

  it("shouldSetDisplayContentsOnShadowRootContentWrapper", () => {
    const tag = generateUniqueTag("shadow-display-contents");
    const component = defineComponent(tag, {
      hasShadow: true,
      render() {
        return "<p>test</p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    const wrapper = el.shadowRoot!.querySelector("div");
    expect(wrapper?.style.display).toBe("contents");
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

  it("shouldThrowErrorWhenObjectPropertyReceivesPrimitive", () => {
    const tag = generateUniqueTag("gap-obj-invalid-prim");
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
      castToProps<{ data: unknown }>(el).data = 123;
    }).toThrow("Property of type Object received non-object value: 123");
  });

  it("shouldThrowErrorWhenObjectPropertyReceivesArray", () => {
    const tag = generateUniqueTag("gap-obj-invalid-arr");
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
      castToProps<{ data: unknown }>(el).data = [1, 2];
    }).toThrow("Property of type Object received non-object value: 1,2");
  });

  it("shouldThrowErrorWhenArrayPropertyReceivesObject", () => {
    const tag = generateUniqueTag("gap-arr-invalid-obj");
    const component = defineComponent(tag, {
      properties: { items: Array },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(() => {
      castToProps<{ items: unknown }>(el).items = { a: 1 };
    }).toThrow("Property of type Array received non-array value: [object Object]");
  });

  it("shouldThrowErrorWhenArrayPropertyReceivesBoolean", () => {
    const tag = generateUniqueTag("gap-arr-invalid-bool");
    const component = defineComponent(tag, {
      properties: { items: Array },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(() => {
      castToProps<{ items: unknown }>(el).items = true;
    }).toThrow("Property of type Array received non-array value: true");
  });

  it("shouldParseJSONStringForArrayProperty", () => {
    const tag = generateUniqueTag("gap-arr-json");
    const component = defineComponent(tag, {
      properties: { items: Array },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    castToProps<{ items: unknown }>(el).items = "[1, 2, 3]";
    expect(castToProps<{ items: unknown }>(el).items).toEqual([1, 2, 3]);
  });

  it("shouldHandleNonErrorJSONParsingFailureGracefullyForArray", () => {
    const tag = generateUniqueTag("gap-arr-json-non-error");
    const component = defineComponent(tag, {
      properties: { items: Array },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    const originalParse = JSON.parse;
    JSON.parse = () => {
      throw "raw string error";
    };

    try {
      expect(() => {
        castToProps<{ items: unknown }>(el).items = "[";
      }).toThrow("Failed to parse JSON value for property of type Array");
    } finally {
      JSON.parse = originalParse;
    }
  });

  it("shouldHandleEmptyAndWhitespaceJSONStringAttributes", () => {
    const tag = generateUniqueTag("cast-json-empty");
    const component = defineComponent(tag, {
      properties: {
        items: Array,
        data: Object,
      },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    // Should not throw and should cast to undefined
    el.setAttribute("items", "");
    expect(castToProps<{ items: unknown }>(el).items).toBeUndefined();

    el.setAttribute("data", "   ");
    expect(castToProps<{ data: unknown }>(el).data).toBeUndefined();
  });

  it("shouldWarnAndScheduleDeferredRenderWhenPropertyMutatedDuringRender", async () => {
    const tag = generateUniqueTag("render-loop-guard");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let renderCount = 0;

    const component = defineComponent(tag, {
      properties: { count: Number },
      render() {
        renderCount++;
        if (renderCount === 1) {
          // Mutate count during render — warns, schedules deferred re-render.
          castToProps<{ count: number }>(this).count = 42;
        }
        return `<p>${this.count}</p>`;
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    // Initial render runs synchronously; mutation warning emitted.
    expect(renderCount).toBe(1);
    expect(castToProps<{ count: number }>(el).count).toBe(42);
    expect(warnSpy).toHaveBeenCalledWith(
      `Component "${tag}": property "count" was mutated during render. This can cause an infinite rendering loop.`,
    );

    // Deferred re-render resolves the stale state in the next microtask.
    await Promise.resolve();
    expect(renderCount).toBe(2);
    expect(el.innerHTML).toContain("<p>42</p>");

    warnSpy.mockRestore();
  });

  it("shouldResetRenderScheduledOnDisconnect", async () => {
    const tag = generateUniqueTag("disconnect-sched");
    let renderCount = 0;
    const component = defineComponent(tag, {
      properties: { count: Number },
      render() {
        renderCount++;
        return `<p>${this.count}</p>`;
      },
    });
    registerComponent(component);

    const el = component.create({ count: 0 });
    document.body.appendChild(el);
    expect(renderCount).toBe(1);

    // Schedule render by mutating property
    castToProps<{ count: number }>(el).count = 1;
    // Disconnect element
    document.body.removeChild(el);

    // Reconnect element synchronously
    document.body.appendChild(el);
    expect(renderCount).toBe(2);

    // Mutate property again. If _isRenderScheduled was NOT reset on disconnect,
    // this mutation would do nothing.
    castToProps<{ count: number }>(el).count = 2;
    await Promise.resolve();

    expect(renderCount).toBe(3);
  });

  it("shouldThrowErrorWhenShadowRootIsMissingDuringRender", () => {
    const tag = generateUniqueTag("shadow-null-test");
    const component = defineComponent(tag, {
      hasShadow: true,
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    Object.defineProperty(el, "shadowRoot", {
      get: () => null,
      configurable: true,
    });

    expect(() => {
      castToProps<{ connectedCallback(): void }>(el).connectedCallback();
    }).toThrow(
      `Component "${tag}": shadow root content wrapper element is missing. Render aborted to prevent style node clobbering.`,
    );
  });
});

describe("defineComponent - additional validations and features", () => {
  it("shouldThrowErrorWhenTagNameHasUppercaseLetters", () => {
    expect(() => {
      defineComponent("My-Component", {
        render() {
          return "<p></p>";
        },
      });
    }).toThrow('Invalid custom element tag name: "My-Component".');
  });

  it("shouldThrowErrorWhenTagNameContainsInvalidCharacters", () => {
    expect(() => {
      defineComponent("my-component!", {
        render() {
          return "<p></p>";
        },
      });
    }).toThrow('Invalid custom element tag name: "my-component!".');
  });

  it("shouldThrowErrorWhenTagNameIsReserved", () => {
    expect(() => {
      defineComponent("font-face", {
        render() {
          return "<p></p>";
        },
      });
    }).toThrow('Invalid custom element tag name: "font-face". "font-face" is a reserved tag name.');
  });

  it("shouldThrowErrorWhenRenderIsMissing", () => {
    expect(() => {
      defineComponent("no-render", {} as unknown as Parameters<typeof defineComponent>[1]);
    }).toThrow('Component "no-render": config.render must be a function.');
  });

  it("shouldMapKebabCaseAttributeToCamelCaseProperty", async () => {
    const tag = generateUniqueTag("kebab-map");
    const component = defineComponent(tag, {
      properties: { myPropValue: String },
      render() {
        return html`
          <p>${this.myPropValue}</p>
        `;
      },
    });
    registerComponent(component);

    const el = component.create({ myPropValue: "initial" });
    document.body.appendChild(el);
    expect(el.innerHTML).toContain("<p>initial</p>");

    el.setAttribute("my-prop-value", "updated-kebab");
    await Promise.resolve();
    expect(castToProps<{ myPropValue: string }>(el).myPropValue).toBe("updated-kebab");
    expect(el.innerHTML).toContain("<p>updated-kebab</p>");
  });

  it("shouldLogAndThrowErrorDuringAsyncRender", async () => {
    const tag = generateUniqueTag("async-err");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = false;

    const component = defineComponent(tag, {
      properties: { val: Number },
      render() {
        if (shouldThrow) {
          throw new Error("Render failed");
        }
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create({ val: 1 });
    document.body.appendChild(el);

    shouldThrow = true;

    // Intercept the private _renderAsync to capture the promise and prevent unhandled rejection
    const instance = el as unknown as { _renderAsync: () => Promise<void> };
    const originalRenderAsync = instance._renderAsync;
    let renderPromise: Promise<void> | null = null;
    instance._renderAsync = function () {
      renderPromise = originalRenderAsync.call(this);
      return renderPromise;
    };

    // Trigger an async render by mutating property
    castToProps<{ val: number }>(el).val = 2;

    // Wait for the promise to reject
    await expect(renderPromise).rejects.toThrow("Render failed");

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unhandled error during async render of component"),
      expect.any(Error),
    );

    errSpy.mockRestore();
  });

  it("shouldCastPreExistingPropertyOnUpgrade", () => {
    const tag = generateUniqueTag("pre-prop");
    const el = document.createElement(tag);
    castToProps<{ value: unknown }>(el).value = "100";
    document.body.appendChild(el);

    const component = defineComponent(tag, {
      properties: { value: Number },
      render() {
        return `<p>${this.value}</p>`;
      },
    });
    registerComponent(component);

    expect(castToProps<{ value: unknown }>(el).value).toBe(100);
  });

  it("shouldCastPreExistingAttributeOnUpgrade", () => {
    const tag = generateUniqueTag("pre-attr");
    const el = document.createElement(tag);
    el.setAttribute("value", "200");
    document.body.appendChild(el);

    const component = defineComponent(tag, {
      properties: { value: Number },
      render() {
        return `<p>${this.value}</p>`;
      },
    });
    registerComponent(component);

    expect(castToProps<{ value: unknown }>(el).value).toBe(200);
  });

  it("shouldCastParsedNullForObjectAndArrayAttributes", () => {
    const tag = generateUniqueTag("parsed-null");
    const component = defineComponent(tag, {
      properties: { data: Object, list: Array },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    el.setAttribute("data", "null");
    el.setAttribute("list", "null");

    expect(castToProps<{ data: unknown }>(el).data).toBeNull();
    expect(castToProps<{ list: unknown }>(el).list).toBeNull();
  });

  it("shouldThrowErrorWhenPropertyNameIsReserved", () => {
    const tag = generateUniqueTag("res-prop");
    expect(() => {
      defineComponent(tag, {
        properties: { requestUpdate: String },
        render() {
          return "<p></p>";
        },
      });
    }).toThrow(`Component "${tag}": property "requestUpdate" is a reserved name.`);
  });

  it("shouldThrowErrorWhenPropertyNameStartsWithUnderscore", () => {
    const tag = generateUniqueTag("under-prop");
    expect(() => {
      defineComponent(tag, {
        properties: { _isMounted: Boolean },
        render() {
          return "<p></p>";
        },
      });
    }).toThrow(`Component "${tag}": property "_isMounted" cannot start with an underscore.`);
  });

  it("shouldTriggerRenderManuallyViaRequestUpdate", async () => {
    const tag = generateUniqueTag("req-up");
    let renderCount = 0;
    const component = defineComponent(tag, {
      render() {
        renderCount++;
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(renderCount).toBe(1);

    el.requestUpdate();
    await Promise.resolve();

    expect(renderCount).toBe(2);
  });

  it("shouldThrowErrorWhenMethodNameConflictsWithProperty", () => {
    const tag = generateUniqueTag("method-prop-conflict");
    expect(() => {
      defineComponent(tag, {
        properties: { count: Number },
        render() {
          return "<p></p>";
        },
        methods: {
          count() {
            // same name as declared property
          },
        },
      });
    }).toThrow(`Component "${tag}": method "count" conflicts with a declared property of the same name.`);
  });

  it("shouldThrowErrorWhenMethodNameIsReserved", () => {
    const tag = generateUniqueTag("method-reserved");
    expect(() => {
      defineComponent(tag, {
        render() {
          return "<p></p>";
        },
        methods: {
          requestUpdate() {
            // reserved name
          },
        },
      });
    }).toThrow(`Component "${tag}": method "requestUpdate" is a reserved name.`);
  });

  it("shouldSupportCustomPropertyConstructors", () => {
    const tag = generateUniqueTag("cust-const");
    class CustomClass {
      constructor(public val: string) {}
    }
    const component = defineComponent(tag, {
      properties: { value: CustomClass },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    const inst = new CustomClass("hello");
    castToProps<{ value: unknown }>(el).value = inst;

    expect(castToProps<{ value: unknown }>(el).value).toBe(inst);
  });

  it("shouldThrowErrorWhenPropertyNamesCollide", () => {
    const tag = generateUniqueTag("prop-collision");
    expect(() => {
      defineComponent(tag, {
        properties: {
          myProp: String,
          "my-prop": String,
        },
        render() {
          return "<p></p>";
        },
      });
    }).toThrow(
      `Component "${tag}": property "my-prop" produces colliding attribute name "my-prop" which is already mapped to property "myProp".`,
    );
  });

  it("shouldCorrectlyConvertCustomClassFromPrimitiveValue", () => {
    const tag = generateUniqueTag("custom-class-cast");
    class User {
      constructor(public name: string) {}
    }
    const component = defineComponent(tag, {
      properties: { user: User },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    castToProps<{ user: unknown }>(el).user = "Alice";
    const userInst = castToProps<{ user: User }>(el).user;
    expect(userInst).toBeInstanceOf(User);
    expect(userInst.name).toBe("Alice");
  });

  it("shouldDefinePropertiesOnPrototype", () => {
    const tag = generateUniqueTag("proto-props");
    const component = defineComponent(tag, {
      properties: { val: String },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el1 = component.create({ val: "a" });
    const el2 = component.create({ val: "b" });

    // Properties should be defined on prototype, not on instance.
    expect(Object.prototype.hasOwnProperty.call(el1, "val")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(el2, "val")).toBe(false);

    expect(el1.val).toBe("a");
    expect(el2.val).toBe("b");
  });

  it("shouldInitializePropertyDefaultValues", () => {
    const tag = generateUniqueTag("default-vals");
    const component = defineComponent(tag, {
      properties: {
        clicks: { type: Number, default: 42 },
        items: { type: Array, default: () => [1, 2] },
        name: { type: String, default: "Bob" },
      },
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el1 = component.create();
    const el2 = component.create();

    expect(castToProps<{ clicks: number }>(el1).clicks).toBe(42);
    expect(castToProps<{ items: number[] }>(el1).items).toEqual([1, 2]);
    expect(castToProps<{ name: string }>(el1).name).toBe("Bob");

    // Verify factory function generates fresh instances
    expect(castToProps<{ items: number[] }>(el1).items).not.toBe(castToProps<{ items: number[] }>(el2).items);
  });

  it("shouldNotRenderRepeatedlyForNaNProperties", async () => {
    const tag = generateUniqueTag("nan-check");
    let renderCount = 0;
    const component = defineComponent(tag, {
      properties: {
        value: Number,
      },
      render() {
        renderCount++;
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    // Initial render
    expect(renderCount).toBe(1);

    // Set to NaN
    castToProps<{ value: unknown }>(el).value = NaN;
    await Promise.resolve(); // wait for deferred render
    expect(renderCount).toBe(2);

    // Set to NaN again — should NOT trigger a third render
    castToProps<{ value: unknown }>(el).value = NaN;
    await Promise.resolve();
    expect(renderCount).toBe(2);
  });

  it("shouldApplyStylesViaShadowDom", () => {
    const tag = generateUniqueTag("styles-shadow");
    const component = defineComponent(tag, {
      hasShadow: true,
      styles: ":host { color: red; }",
      render() {
        return "<p></p>";
      },
    });
    registerComponent(component);

    const el = component.create();
    document.body.appendChild(el);

    expect(el.shadowRoot).not.toBeNull();

    // Either adoptedStyleSheets are used, or style tag fallback is appended
    const adoptedSheets = el.shadowRoot!.adoptedStyleSheets;
    const hasAdoptedSheets = adoptedSheets !== undefined && adoptedSheets.length > 0;
    const hasStyleTag = el.shadowRoot!.querySelector("style") !== null;
    expect(hasAdoptedSheets || hasStyleTag).toBe(true);
  });
});
