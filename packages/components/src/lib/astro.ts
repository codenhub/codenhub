import { registerComponents } from "../core/registry.js";
import { ChButton as ChButtonDefinition } from "./button.js";

// Auto register in browser environments
if (typeof customElements !== "undefined") {
  registerComponents([ChButtonDefinition]);
}

/**
 * Native `<ch-button>` definition for Astro applications.
 * Importing this module automatically registers the element when
 * `customElements` is available; server imports do not register it.
 */
export { ChButtonDefinition as ChButton };
