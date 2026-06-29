import type { ComponentDefinition, ComponentProperties } from "./types.js";

/**
 * Registers an array of component definitions in the browser's global
 * `customElements` registry.
 *
 * Safely skips any component whose tag is already registered, preventing
 * duplicate registration errors in hot-reload and test environments.
 *
 * @param components - Definitions returned by `defineComponent`.
 *
 * @example
 * ```ts
 * import { registerComponents } from "@codenhub/components";
 * import { UserCard } from "./components/user-card.js";
 *
 * registerComponents([UserCard]);
 * ```
 */
export function registerComponents(components: ComponentDefinition<ComponentProperties, unknown>[]): void {
  if (typeof customElements === "undefined") {
    return;
  }

  for (const component of components) {
    if (customElements.get(component.tagName) === undefined) {
      customElements.define(component.tagName, component.elementClass);
    }
  }
}
