---
title: Overview
---

# Build native components and framework bridges

The `@codenhub/components` package provides a native Web Component factory,
escaped HTML templates, component registration, one ready-to-use Light DOM
component, and separate framework integration entrypoints. It is useful when an
application wants reusable Custom Elements directly or needs a small bridge
from those elements into React, Svelte, or Astro.

## Setup

### Installation

```sh
pnpm add @codenhub/components
```

Install the optional peer for any framework adapter you import. Install
`@codenhub/styles` when using the library button's default visual treatment.

### Quick start

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

### Configuration

Pass property declarations, lifecycle hooks, styles, methods, and a required
renderer to `defineComponent`. Components use Light DOM by default; set
`hasShadow: true` when the component should render into an open Shadow Root.
See the [core API](./core-api.md#configuration) for all options and lifecycle
timing.

## Requirements

- Component rendering requires a browser with Custom Elements v1. The core
  module can be imported in non-browser environments, and registration is a
  no-op when `customElements` is unavailable.
- React 18+, Svelte 4+, or Astro 4+ is required only for the corresponding
  optional integration entrypoint.
- ESM-compatible tooling is required.

The library button uses Light DOM and expects `@codenhub/styles` for its default
appearance. The core factory itself does not require that stylesheet.

Rendering replaces component content with `innerHTML`. Reactive updates can
therefore discard child state, focus, selection, and listeners; review the
[core lifecycle constraints](./core-api.md#component-definitions) before using
the factory for stateful content.

## Next steps

- [Core API](./core-api.md) covers definitions, templates, registration,
  lifecycle timing, rendering behavior, types, and errors.
- [Component library](./component-library.md) covers the ready-to-use native
  `ChButton` definition and its styling expectations.
- [Framework adapters](./framework-adapters.md) explains the distinct React,
  Svelte, and Astro entrypoints and their client-loading behavior.
