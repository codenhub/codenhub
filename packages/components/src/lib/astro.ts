import { registerComponents } from "../core/registry.js";
import { ChButton as ChButtonDefinition } from "./button.js";

// Auto register in browser environments
if (typeof customElements !== "undefined") {
  registerComponents([ChButtonDefinition]);
}

/**
 * An Astro-compatible export for the native `<ch-button>` custom element.
 * Automatically registers the custom element on mount in the browser.
 */
export { ChButtonDefinition as ChButton };
