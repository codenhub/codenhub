import { lucideProvider } from "./registry/providers/lucide.js";
import { IconRegistry } from "./registry/registry.js";

/**
 * Default global `IconRegistry` instance pre-configured with `lucideProvider`.
 */
export const registry: IconRegistry = new IconRegistry();
registry.registerProvider(lucideProvider);

export { IconRegistry } from "./registry/registry.js";
export { lucideIconSet, lucideProvider } from "./registry/providers/lucide.js";
export type { IconDefinition, IconProvider, IconRegistryOptions, IconSet, ResolvedIcon } from "./registry/types.js";

export { generateBaseCss, generateIconCss } from "./generator/css-generator.js";
export type { BaseCssOptions } from "./generator/css-generator.js";
export { svgToDataUri } from "./generator/svg-encoder.js";

export { scanIconClasses } from "./scanner/class-scanner.js";
export type { ScanIconClassesOptions } from "./scanner/class-scanner.js";

export default registry;
