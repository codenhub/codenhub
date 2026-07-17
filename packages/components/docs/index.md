# @codenhub/components

`@codenhub/components` provides a native Web Component factory, escaped HTML
templates, component registration, one ready-to-use Light DOM component, and
separate framework integration entrypoints. It is useful when an application
wants reusable Custom Elements directly or needs a small bridge from those
elements into React, Svelte, or Astro.

> **Experimental:** The component factory API, adapters, and ready-to-use
> component contracts may change while framework support is stabilized.

## Start with a component definition

Define a custom element, register it once, and then create or render instances:

```ts
import { defineComponent, html, registerComponents } from "@codenhub/components";

const UserCard = defineComponent("user-card", {
  properties: { name: String },
  render() {
    return html`
      <p>Hello, ${this.name}</p>
    `;
  },
});

registerComponents([UserCard]);
document.body.append(UserCard.create({ name: "Ada" }));
```

Dynamic values in `html` templates are escaped. Use `unsafeHTML` only with
trusted or sanitized content.

## Choose where to go next

- [Core API](./core-api.md) covers definitions, templates, registration,
  lifecycle timing, rendering behavior, types, and errors.
- [Component library](./component-library.md) covers the ready-to-use native
  `ChButton` definition and its styling expectations.
- [Framework adapters](./framework-adapters.md) explains the distinct React,
  Svelte, and Astro entrypoints and their client-loading behavior.

Actual component rendering requires browser Custom Elements support. The core
module can be imported in non-browser environments, and registration becomes a
no-op when `customElements` is unavailable. Framework support and server/client
loading behavior remain experimental.

The library button uses Light DOM and expects `@codenhub/styles` for its default
appearance. The core factory itself does not require that stylesheet.

Rendering replaces component content with `innerHTML`. Reactive updates can
therefore discard child state, focus, selection, and listeners; review the
[core lifecycle constraints](./core-api.md#component-definitions) before using
the factory for stateful content.
