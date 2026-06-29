import type { ComponentConfig, ComponentDefinition, ComponentProperties, ComponentProps } from "./types.js";

/**
 * Casts a raw attribute or property value to the type indicated by its
 * constructor. Called at every property set and `attributeChangedCallback`.
 *
 * - `undefined` passes through unchanged for all types.
 * - `null` passes through unchanged for non-Boolean types; for `Boolean`, `null`
 *   maps to `false` (attribute-removal semantics — `removeAttribute` passes `null`).
 * - `Object`/`Array` constructors attempt `JSON.parse` when value is a string.
 *
 * @internal
 */
function castProperty(value: unknown, type: ComponentProperties[string]): unknown {
  // undefined passes through unchanged for all types. An undefined value means
  // the property has never been set and should stay uninitialized.
  if (value === undefined) {
    return value;
  }

  if (type === Boolean) {
    // null arrives from removeAttribute (attribute absence), which maps to false
    // per standard HTML boolean attribute semantics documented in the README.
    if (value === null) {
      return false;
    }
    return value === "true" || value === "" || value === true;
  }

  // For all other types, null passes through unchanged so consumers can
  // distinguish "not yet set" from a typed value.
  if (value === null) {
    return value;
  }

  if (type === String) {
    return String(value);
  }
  if (type === Number) {
    if (typeof value === "string" && value.trim() === "") {
      return NaN;
    }
    return Number(value);
  }
  if (type === Object || type === Array) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (err) {
        throw new Error(`Failed to parse JSON value for property of type ${type.name}: "${value}"`, {
          cause: err instanceof Error ? err : undefined,
        });
      }
    }
    return value;
  }
  return value;
}

/**
 * Defines a Web Component from a plain configuration object.
 *
 * Creates and returns a `ComponentDefinition` that wraps a native
 * `HTMLElement` subclass. The element is **not** registered in
 * `customElements` until you call `registerComponents`.
 *
 * Reactive properties declared in `config.properties` trigger a
 * batched micro-task re-render when mutated. Attribute changes are
 * forwarded to the matching property setter.
 *
 * @param tagName - Custom element tag name (must contain a hyphen).
 * @param config - Component configuration including properties, lifecycle
 *   hooks, render function, and optional methods.
 * @returns A `ComponentDefinition` holding the class and a `create` factory.
 *
 * @throws {Error} When a property declared as `Object` or `Array` receives a
 *   string value that cannot be parsed as JSON — thrown from the property
 *   setter and propagates to the caller (e.g. direct assignment or
 *   `setAttribute`).
 *
 * @example
 * ```ts
 * const Counter = defineComponent("my-counter", {
 *   properties: { count: Number },
 *   render() {
 *     return html`<button>${this.count}</button>`;
 *   },
 * });
 * ```
 */
export function defineComponent<Props extends ComponentProperties, Methods>(
  tagName: string,
  config: ComponentConfig<Props, Methods>,
): ComponentDefinition<Props, Methods> {
  if (!tagName.includes("-")) {
    throw new Error(`Invalid custom element tag name: "${tagName}". Custom element tag names must contain a hyphen.`);
  }

  const properties = (config.properties ?? {}) as Props;
  const methods = (config.methods ?? {}) as Methods;
  const shouldUseShadow = config.hasShadow === true;

  if (config.styles !== undefined && !shouldUseShadow) {
    console.warn(
      `Component "${tagName}" declared styles but "hasShadow" is not enabled. ` +
        "Styles are only injected when hasShadow is true.",
    );
  }

  const attributeToPropertyMap = new Map<string, string>();
  for (const propName of Object.keys(properties)) {
    attributeToPropertyMap.set(propName.toLowerCase(), propName);
  }

  class CustomElement extends HTMLElement {
    private _isRenderScheduled = false;
    private _isMounted = false;

    static get observedAttributes(): string[] {
      return Array.from(attributeToPropertyMap.keys());
    }

    constructor() {
      super();

      // Wire reactive getters/setters for each declared property.
      for (const propName of Object.keys(properties)) {
        let storedValue: unknown = (this as Record<string, unknown>)[propName];

        Object.defineProperty(this, propName, {
          get: () => storedValue,
          set: (newValue: unknown) => {
            const casted = castProperty(newValue, properties[propName]);
            if (storedValue !== casted) {
              storedValue = casted;
              this._scheduleRender();
            }
          },
          configurable: true,
          enumerable: true,
        });
      }

      // Bind all methods to the instance so `this` is always the element.
      for (const [name, fn] of Object.entries(methods as Record<string, unknown>)) {
        (this as Record<string, unknown>)[name] = (fn as () => unknown).bind(this);
      }

      if (shouldUseShadow) {
        const shadow = this.attachShadow({ mode: "open" });
        if (config.styles) {
          const style = document.createElement("style");
          style.textContent = config.styles;
          shadow.appendChild(style);
        }
        // Dedicated content wrapper so renders can simply set innerHTML
        // without needing to walk siblings to avoid clobbering the style node.
        const contentWrapper = document.createElement("div");
        shadow.appendChild(contentWrapper);
      }
    }

    connectedCallback(): void {
      this._isMounted = true;
      // Render fires first so the DOM is populated before onMount runs.
      // Call order on first connect: render → onUpdate → onMount.
      this._render();
      config.onMount?.call(this as unknown as HTMLElement & ComponentProps<Props> & Methods);
    }

    disconnectedCallback(): void {
      this._isMounted = false;
      config.onUnmount?.call(this as unknown as HTMLElement & ComponentProps<Props> & Methods);
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
      if (oldValue === newValue) {
        return;
      }

      const propKey = attributeToPropertyMap.get(name.toLowerCase());

      if (propKey !== undefined) {
        (this as Record<string, unknown>)[propKey] = newValue;
      }
    }

    private _scheduleRender(): void {
      if (this._isRenderScheduled || !this._isMounted) {
        return;
      }
      this._isRenderScheduled = true;
      void this._renderAsync();
    }

    private async _renderAsync(): Promise<void> {
      await Promise.resolve();
      this._isRenderScheduled = false;
      if (this._isMounted) {
        this._render();
      }
    }

    private _render(): void {
      const htmlContent = config.render.call(this as unknown as HTMLElement & ComponentProps<Props> & Methods);

      if (shouldUseShadow) {
        const root = this.shadowRoot!;
        // The dedicated content wrapper is always the last child of the shadow
        // root (appened in the constructor after the optional style node).
        // Setting innerHTML on it avoids any need to walk siblings to preserve
        // the style node across renders.
        const contentWrapper = root.lastElementChild as HTMLElement | null;
        if (contentWrapper === null) {
          throw new Error(
            `Component "${tagName}": shadow root content wrapper element is missing. ` +
              "Render aborted to prevent style node clobbering.",
          );
        }
        contentWrapper.innerHTML = htmlContent;
      } else {
        this.innerHTML = htmlContent;
      }

      config.onUpdate?.call(this as unknown as HTMLElement & ComponentProps<Props> & Methods);
    }
  }

  return {
    tagName,
    elementClass: CustomElement as unknown as ComponentDefinition<Props, Methods>["elementClass"],
    create(props) {
      const element = new CustomElement();
      if (props !== undefined) {
        // Object.assign goes through the reactive setters installed in the
        // constructor, so property assignments here trigger type casting.
        // The element is not yet connected so no render is scheduled yet.
        Object.assign(element, props);
      }
      return element as unknown as HTMLElement & ComponentProps<Props> & Methods;
    },
  };
}
