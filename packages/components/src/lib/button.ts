import { defineComponent } from "../core/component/factory.js";
import { html } from "../core/html.js";

/**
 * A ready-to-use Button custom element.
 * Inherits global styles from `@codenhub/styles`.
 */
export const ChButton = defineComponent("ch-button", {
  properties: {
    label: { type: String, default: "" },
    variant: { type: String, default: "primary" }, // primary, secondary, destructive, ghost
    disabled: { type: Boolean, default: false },
  },
  events: {
    click: MouseEvent,
  },
  render() {
    const variantClass = this.variant || "primary";
    const disabledAttr = this.disabled ? "disabled" : "";
    return html`
      <button class="btn ${variantClass}" ${disabledAttr}>${this.label}</button>
    `;
  },
});
