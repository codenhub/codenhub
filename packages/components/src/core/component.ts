import { TemplateResult } from "./html.js";
import type { ComponentConfig, ComponentDefinition, ComponentInstance, ComponentProperties } from "./types.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as typeof HTMLElement);

interface CustomElementInternal {
  _propertyValues: Record<string, unknown>;
  _isRendering: boolean;
  _mutatedDuringRender: boolean;
  _scheduleRender(): void;
}

/**
 * Casts a raw attribute or property value to the type indicated by its
 * constructor. Called at every property set and `attributeChangedCallback`.
 *
 * - `undefined` passes through unchanged for all types.
 * - `null` passes through unchanged for non-Boolean types; for `Boolean`, `null`
 *   maps to `false` (attribute-removal semantics — `removeAttribute` passes `null`).
 * - `Object`/`Array` constructors attempt `JSON.parse` when value is a string.
 * - Any unsupported constructor types pass the value through unchanged as a fallback.
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
    // Any value that is not null, false, or the string "false" is considered true
    // (treating present attribute values like "active" or "" as true).
    if (value === null || value === false || value === "false") {
      return false;
    }
    return true;
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
  if (type === Array) {
    let parsed = value;
    if (typeof value === "string") {
      if (value.trim() === "") {
        return undefined;
      }
      try {
        parsed = JSON.parse(value);
      } catch (err) {
        throw new Error(`Failed to parse JSON value for property of type ${type.name}: "${value}"`, {
          cause: err instanceof Error ? err : undefined,
        });
      }
    }
    if (parsed === null) {
      return null;
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`Property of type ${type.name} received non-array value: ${String(parsed)}`);
    }
    return parsed;
  }

  if (type === Object) {
    let parsed = value;
    if (typeof value === "string") {
      if (value.trim() === "") {
        return undefined;
      }
      try {
        parsed = JSON.parse(value);
      } catch (err) {
        throw new Error(`Failed to parse JSON value for property of type ${type.name}: "${value}"`, {
          cause: err instanceof Error ? err : undefined,
        });
      }
    }
    if (parsed === null) {
      return null;
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Property of type ${type.name} received non-object value: ${String(parsed)}`);
    }
    return parsed;
  }

  // Custom constructor/converter logic
  if (typeof type === "function") {
    if (value instanceof type) {
      return value;
    }
    // Check if it's a class or native constructor
    const typeStr = Function.prototype.toString.call(type);
    const isClassOrNative =
      typeStr.startsWith("class") ||
      /^(?:Date|RegExp|Map|Set|URL|URLSearchParams|WeakMap|WeakSet|ArrayBuffer|SharedArrayBuffer|DataView|Float32Array|Float64Array|Int8Array|Int16Array|Int32Array|Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|BigInt64Array|BigUint64Array)$/.test(
        type.name,
      );

    try {
      if (isClassOrNative) {
        return new (type as new (...args: unknown[]) => unknown)(value);
      } else {
        return (type as Function)(value);
      }
    } catch (err) {
      throw new Error(`Failed to convert value using custom constructor/converter: "${value}"`, {
        cause: err instanceof Error ? err : undefined,
      });
    }
  }

  return value;
}

const VALID_TAG_NAME_REGEX = /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/;
const RESERVED_TAG_NAMES = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);
const RESERVED_NAMES = new Set([
  "constructor",
  "connectedCallback",
  "disconnectedCallback",
  "attributeChangedCallback",
  "adoptedCallback",
  "tagName",
  "elementClass",
  "create",
  "requestUpdate",
]);

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
 * @throws {Error} When the `tagName` does not contain a hyphen.
 * @throws {Error} When a property declared as `Object` or `Array` receives a
 *   string value that cannot be parsed as JSON — thrown from the property
 *   setter and propagates to the caller (e.g. direct assignment or
 *   `setAttribute`).
 * @throws {Error} During rendering if `hasShadow` is enabled but the dedicated
 *   shadow root content wrapper is removed or missing from the shadow root.
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
  if (!VALID_TAG_NAME_REGEX.test(tagName)) {
    throw new Error(
      `Invalid custom element tag name: "${tagName}". ` +
        "Custom element tag names must start with a lowercase letter, contain at least one hyphen, and only contain lowercase letters, digits, dots, underscores, or hyphens.",
    );
  }
  if (RESERVED_TAG_NAMES.has(tagName)) {
    throw new Error(`Invalid custom element tag name: "${tagName}". "${tagName}" is a reserved tag name.`);
  }

  if (typeof config.render !== "function") {
    throw new Error(`Component "${tagName}": config.render must be a function.`);
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
    if (RESERVED_NAMES.has(propName)) {
      throw new Error(`Component "${tagName}": property "${propName}" is a reserved name.`);
    }
    if (propName.startsWith("_")) {
      throw new Error(`Component "${tagName}": property "${propName}" cannot start with an underscore.`);
    }

    const checkAndSetAttribute = (attrName: string) => {
      const existingProp = attributeToPropertyMap.get(attrName);
      if (existingProp !== undefined && existingProp !== propName) {
        throw new Error(
          `Component "${tagName}": property "${propName}" produces colliding attribute name "${attrName}" ` +
            `which is already mapped to property "${existingProp}".`,
        );
      }
      attributeToPropertyMap.set(attrName, propName);
    };

    checkAndSetAttribute(propName.toLowerCase());
    const kebabName = propName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    if (kebabName !== propName.toLowerCase()) {
      checkAndSetAttribute(kebabName);
    }
  }

  for (const methodName of Object.keys(methods as object)) {
    if (Object.prototype.hasOwnProperty.call(properties, methodName)) {
      throw new Error(
        `Component "${tagName}": method "${methodName}" conflicts with a declared property of the same name.`,
      );
    }
    if (RESERVED_NAMES.has(methodName)) {
      throw new Error(`Component "${tagName}": method "${methodName}" is a reserved name.`);
    }
  }

  class CustomElement extends BaseElement {
    private _isRenderScheduled = false;
    private _isMounted = false;
    _isRendering = false;
    private _mutatedDuringRender = false;
    private _contentWrapper: HTMLElement | null = null;
    _propertyValues: Record<string, unknown> = {};

    static get observedAttributes(): string[] {
      return Array.from(attributeToPropertyMap.keys());
    }

    constructor() {
      super();

      this._propertyValues = {};
      // Capture pre-existing own properties (upgraded elements)
      for (const propName of Object.keys(properties)) {
        if (Object.prototype.hasOwnProperty.call(this, propName)) {
          const val = (this as Record<string, unknown>)[propName];
          delete (this as Record<string, unknown>)[propName];
          (this as Record<string, unknown>)[propName] = val;
        }
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
        // display:contents makes the wrapper transparent to flex/grid layouts
        // so child elements behave as direct children of the shadow host.
        const contentWrapper = document.createElement("div");
        contentWrapper.style.display = "contents";
        shadow.appendChild(contentWrapper);
        this._contentWrapper = contentWrapper;
      }
    }

    requestUpdate(): void {
      this._scheduleRender();
    }

    connectedCallback(): void {
      this._isMounted = true;
      // Render fires first so the DOM is populated before onMount runs.
      // Call order on first connect: render → onUpdate → onMount.
      this._render();
      config.onMount?.call(this as unknown as ComponentInstance<Props, Methods>);
    }

    disconnectedCallback(): void {
      this._isMounted = false;
      this._isRenderScheduled = false;
      config.onUnmount?.call(this as unknown as ComponentInstance<Props, Methods>);
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
      if (this._isRenderScheduled) {
        this._isRenderScheduled = false;
        if (this._isMounted) {
          try {
            this._render();
          } catch (err) {
            console.error(`Unhandled error during async render of component "${tagName}":`, err);
            throw err;
          }
        }
      }
    }

    private _render(): void {
      this._isRenderScheduled = false;
      this._isRendering = true;
      this._mutatedDuringRender = false;
      let htmlContent: string | TemplateResult;
      try {
        htmlContent = config.render.call(this as unknown as ComponentInstance<Props, Methods>);
      } finally {
        this._isRendering = false;
        if (this._mutatedDuringRender) {
          this._mutatedDuringRender = false;
          this._scheduleRender();
        }
      }

      const rawHTML = htmlContent instanceof TemplateResult ? htmlContent.value : String(htmlContent);

      if (shouldUseShadow) {
        const contentWrapper = this._contentWrapper;
        if (contentWrapper === null || !this.shadowRoot || contentWrapper.parentNode !== this.shadowRoot) {
          throw new Error(
            `Component "${tagName}": shadow root content wrapper element is missing. ` +
              "Render aborted to prevent style node clobbering.",
          );
        }
        contentWrapper.innerHTML = rawHTML;
      } else {
        this.innerHTML = rawHTML;
      }

      config.onUpdate?.call(this as unknown as ComponentInstance<Props, Methods>);
    }
  }

  // Wire reactive getters/setters on prototype.
  for (const propName of Object.keys(properties)) {
    const propConfig = properties[propName];
    Object.defineProperty(CustomElement.prototype, propName, {
      get(this: HTMLElement) {
        const self = this as unknown as CustomElementInternal;
        return self._propertyValues?.[propName];
      },
      set(this: HTMLElement, newValue: unknown) {
        const casted = castProperty(newValue, propConfig);
        const self = this as unknown as CustomElementInternal;
        if (!self._propertyValues) {
          self._propertyValues = {};
        }
        const storedValue = self._propertyValues[propName];
        if (storedValue !== casted) {
          self._propertyValues[propName] = casted;
          if (self._isRendering) {
            console.warn(
              `Component "${tagName}": property "${propName}" was mutated during render. ` +
                "This can cause an infinite rendering loop.",
            );
            self._mutatedDuringRender = true;
            return;
          }
          self._scheduleRender();
        }
      },
      configurable: true,
      enumerable: true,
    });
  }

  return {
    tagName,
    elementClass: CustomElement as unknown as ComponentDefinition<Props, Methods>["elementClass"],
    create(props) {
      const element = new CustomElement();
      if (props !== undefined) {
        // Object.assign goes through the reactive setters installed on the
        // prototype, so property assignments here trigger type casting.
        // The element is not yet connected so no render is scheduled yet.
        Object.assign(element, props);
      }
      return element as unknown as ComponentInstance<Props, Methods>;
    },
  };
}
