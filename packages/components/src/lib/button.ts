import { defineComponent } from "../core/component/factory.js";
import { html } from "../core/html.js";

/**
 * Native `<ch-button>` component definition for registration or programmatic
 * creation.
 *
 * The Light DOM button accepts `label`, `variant`, and `disabled` properties.
 * Import `@codenhub/styles` to provide the default `.btn` and variant styling.
 * This definition is not registered automatically.
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
