import type { ComponentConfig, ComponentDefinition, ComponentProperties, ComponentProps } from "./types.js";

/**
 * Casts a raw attribute or property value to the type indicated by its
 * constructor. Called at every property set and `attributeChangedCallback`.
 *
 * - `null`/`undefined` pass through unchanged.
 * - `Object`/`Array` constructors attempt `JSON.parse` when value is a string.
 */
function castProperty(value: unknown, type: ComponentProperties[string]): unknown {
  if (type === Boolean) {
    return value === "true" || value === "" || value === true;
  }
  if (value === undefined || value === null) {
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
  const properties = (config.properties ?? {}) as Props;
  const methods = (config.methods ?? {}) as Methods;
  const useShadow = config.hasShadow === true;

  const attributeToPropertyMap = new Map<string, string>();
  for (const propName of Object.keys(properties)) {
    attributeToPropertyMap.set(propName.toLowerCase(), propName);
  }

  class CustomElement extends HTMLElement {
    private _renderScheduled = false;
    private _isMounted = false;
    /** Preserved style node when using Shadow DOM, avoids repeated queries. */
    private _styleNode: HTMLStyleElement | null = null;

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

      if (useShadow) {
        const shadow = this.attachShadow({ mode: "open" });
        if (config.styles) {
          const style = document.createElement("style");
          style.textContent = config.styles;
          this._styleNode = style;
          shadow.appendChild(style);
        }
      }
    }

    connectedCallback(): void {
      this._isMounted = true;
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
      if (this._renderScheduled || !this._isMounted) {
        return;
      }
      this._renderScheduled = true;
      void this._renderAsync();
    }

    private async _renderAsync(): Promise<void> {
      await Promise.resolve();
      this._renderScheduled = false;
      this._render();
    }

    private _render(): void {
      const htmlContent = config.render.call(this as unknown as HTMLElement & ComponentProps<Props> & Methods);

      if (useShadow) {
        const root = this.shadowRoot!;
        let child = root.firstChild;
        while (child !== null) {
          const next = child.nextSibling;
          if (child !== this._styleNode) {
            root.removeChild(child);
          }
          child = next;
        }
        const wrapper = document.createElement("div");
        wrapper.innerHTML = htmlContent;
        while (wrapper.firstChild !== null) {
          root.appendChild(wrapper.firstChild);
        }
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
        Object.assign(element, props);
      }
      return element as unknown as HTMLElement & ComponentProps<Props> & Methods;
    },
  };
}
