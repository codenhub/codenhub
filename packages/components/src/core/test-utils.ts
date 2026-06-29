import { registerComponents } from "./registry.js";
import type { ComponentDefinition, ComponentProperties } from "./types.js";

let tagCounter = 0;

/**
 * Generates a unique custom element tag name for test isolation.
 * Prevents re-registration conflicts across tests in the same jsdom environment.
 *
 * @internal
 */
export function uniqueTag(base: string): string {
  return `${base}-${++tagCounter}`;
}

/**
 * Registers a component definition, widening its type to satisfy
 * `registerComponents` without requiring callers to cast manually.
 *
 * @internal
 */
export function reg(component: unknown): void {
  registerComponents([component as ComponentDefinition<ComponentProperties, unknown>]);
}

/**
 * Casts an element to a typed props interface for test assertions.
 * Avoids the verbose `(el as unknown as Record<string, unknown>)` pattern
 * by providing a narrow, test-local type view of the element's properties.
 *
 * @internal
 */
export function asProps<T>(element: HTMLElement): T {
  return element as unknown as T;
}
