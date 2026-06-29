import { registerComponents } from "./registry.js";
import type { ComponentDefinition, ComponentProperties } from "./types.js";

let tagCounter = 0;

/**
 * Generates a unique custom element tag name for test isolation.
 * Prevents re-registration conflicts across tests in the same jsdom environment.
 */
export function uniqueTag(base: string): string {
  return `${base}-${++tagCounter}`;
}

/**
 * Registers a component definition, widening its type to satisfy
 * `registerComponents` without requiring callers to cast manually.
 */
export function reg(component: unknown): void {
  registerComponents([component as ComponentDefinition<ComponentProperties, unknown>]);
}
