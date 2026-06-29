import type { TemplateResult } from "./html.js";

/**
 * Supported constructor types for component property declarations.
 * Maps to their corresponding TypeScript primitive/structural types.
 */
export type PropertyConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ObjectConstructor
  | ArrayConstructor
  | (new (...args: never[]) => unknown)
  | ((...args: never[]) => unknown);

/**
 * Resolves a `PropertyConstructor` to its corresponding TypeScript value type.
 */
export type PropertyType<T extends PropertyConstructor> = T extends StringConstructor
  ? string | undefined | null
  : T extends NumberConstructor
    ? number | undefined | null
    : T extends BooleanConstructor
      ? boolean | undefined
      : T extends ObjectConstructor
        ? Record<string, unknown> | undefined | null
        : T extends ArrayConstructor
          ? unknown[] | undefined | null
          : T extends new (...args: never[]) => infer R
            ? R | undefined | null
            : T extends (...args: never[]) => infer R
              ? R | undefined | null
              : unknown;

/**
 * Represents the full type of a component instance, including HTML element APIs,
 * reactive properties, custom methods, and built-in wrappers.
 */
export type ComponentInstance<Props extends ComponentProperties, Methods> = HTMLElement &
  ComponentProps<Props> &
  Methods & {
    /**
     * Schedules a batched re-render of the component in the next microtask.
     */
    requestUpdate(): void;
  };

/**
 * A map of property names to their constructor types.
 * Used to declare reactive properties on a component.
 */
export type ComponentProperties = Record<string, PropertyConstructor>;

/**
 * Resolves a `ComponentProperties` map to a concrete props object type,
 * where each key maps to its resolved `PropertyType`.
 */
export type ComponentProps<Props extends ComponentProperties> = {
  [K in keyof Props]: PropertyType<Props[K]>;
};

/**
 * Configuration object passed to `defineComponent`.
 *
 * @typeParam Props - Property declarations map.
 * @typeParam Methods - Custom method definitions bound to the element instance.
 */
export interface ComponentConfig<Props extends ComponentProperties, Methods> {
  /**
   * Map of property names to constructor types for type casting and reactivity.
   * Property changes trigger a batched re-render.
   */
  properties?: Props;
  /**
   * Whether to attach a Shadow DOM to the element.
   * Defaults to `false`, allowing global stylesheets to reach the element.
   */
  hasShadow?: boolean;
  /**
   * Encapsulated CSS string injected into Shadow DOM as a `<style>` tag.
   * Only applied when `hasShadow` is `true`.
   */
  styles?: string;
  /**
   * Called once after the element is inserted into the document.
   * Safe for one-time setup logic that depends on DOM presence.
   */
  onMount?: (this: ComponentInstance<Props, Methods>) => void;
  /**
   * Called when the element is removed from the document.
   * Safe for cleanup logic such as clearing timers or subscriptions.
   */
  onUnmount?: (this: ComponentInstance<Props, Methods>) => void;
  /**
   * Called immediately after every render, including the initial one.
   * Safe for binding event listeners to freshly rendered DOM nodes.
   */
  onUpdate?: (this: ComponentInstance<Props, Methods>) => void;
  /**
   * Returns an HTML string or TemplateResult representing the component's current state.
   * Called on mount and after any reactive property change.
   */
  render: (this: ComponentInstance<Props, Methods>) => string | TemplateResult;
  /**
   * Custom methods bound to the element instance.
   * Accessible as `this.methodName` inside other config hooks.
   */
  methods?: Methods & ThisType<ComponentInstance<Props, Methods>>;
}

/**
 * The object returned by `defineComponent`.
 * Holds the custom element class and a factory for programmatic creation.
 *
 * @typeParam Props - Property declarations map.
 * @typeParam Methods - Custom method definitions.
 */
export interface ComponentDefinition<Props extends ComponentProperties, Methods> {
  /** The registered custom element tag name. */
  tagName: string;
  /** The underlying `HTMLElement` subclass. Pass to `customElements.define`. */
  elementClass: { new (): ComponentInstance<Props, Methods> };
  /**
   * Creates a new element instance and optionally sets initial properties.
   * The element must be appended to the DOM to trigger `onMount`.
   */
  create: (props?: Partial<ComponentProps<Props>>) => ComponentInstance<Props, Methods>;
}
