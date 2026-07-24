import { lucideProvider } from "./registry/providers/lucide/index.js";
import { IconRegistry } from "./registry/registry.js";

let defaultRegistryInstance: IconRegistry | undefined;

function getDefaultRegistry(): IconRegistry {
  if (!defaultRegistryInstance) {
    defaultRegistryInstance = new IconRegistry();
    defaultRegistryInstance.registerProvider(lucideProvider);
  }
  return defaultRegistryInstance;
}

/**
 * Default global `IconRegistry` instance pre-configured with `lucideProvider`.
 */
export const registry: IconRegistry = new Proxy({} as IconRegistry, {
  get(_target, prop: keyof IconRegistry) {
    const instance = getDefaultRegistry();
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
  set(_target, prop: keyof IconRegistry, value) {
    const instance = getDefaultRegistry();
    Reflect.set(instance, prop, value);
    return true;
  },
});

export { IconRegistry } from "./registry/registry.js";
export { lucideIconSet, lucideProvider } from "./registry/providers/lucide/index.js";
export type { IconDefinition, IconProvider, IconRegistryOptions, IconSet, ResolvedIcon } from "./registry/types.js";

export { generateBaseCss, generateIconCss, generateIconSetCss } from "./generator/css-generator.js";
export type { BaseCssOptions, GenerateIconSetCssOptions } from "./generator/css-generator.js";
export { svgToDataUri } from "./generator/svg-encoder.js";

export { scanFiles, scanIconClasses } from "./scanner/class-scanner.js";
export type { ScanIconClassesOptions } from "./scanner/class-scanner.js";

export default registry;
