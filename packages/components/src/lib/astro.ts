import { registerComponents } from "../core/registry.js";
import { ChButton as ChButtonDefinition } from "./button.js";

// Auto register in browser environments
if (typeof customElements !== "undefined") {
  registerComponents([ChButtonDefinition]);
}

export { ChButtonDefinition as ChButton };
