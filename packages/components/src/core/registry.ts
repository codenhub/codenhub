/**
 * Registers an array of component definitions in the browser's global
 * `customElements` registry.
 *
 * Safely skips any component whose tag is already registered, preventing
 * duplicate registration errors in hot-reload and test environments.
 *
 * In non-browser environments where `customElements` is unavailable (SSR, Node.js),
 * this function is a no-op and returns immediately without throwing.
 *
 * @param components - Array of definitions containing tag names and classes.
 *
 * @example
 * ```ts
 * import { registerComponents } from "@codenhub/components";
 * import { UserCard } from "./components/user-card.js";
 *
 * registerComponents([UserCard]);
 * ```
 */
export function registerComponents(components: { tagName: string; elementClass: { new (): HTMLElement } }[]): void {
  if (typeof customElements === "undefined") {
    return;
  }

  for (const component of components) {
    if (customElements.get(component.tagName) === undefined) {
      customElements.define(component.tagName, component.elementClass);
    }
  }
}
