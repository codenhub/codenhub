# @codenhub/components

Native Web Component primitives, a small ready-to-use component library, and
focused React, Svelte, and Astro integration entrypoints.

> **Experimental:** The component factory API, adapters, and ready-to-use
> component contracts may change while framework support is stabilized.

## Installation

```sh
pnpm add @codenhub/components
```

Install the optional peer for any framework adapter you import. Install
`@codenhub/styles` when using the library component's default visual treatment.

## Usage

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

Dynamic values in `html` are escaped. Use `unsafeHTML` only with trusted or
sanitized content.

## Documentation

- [Documentation overview](./docs/index.md): Complete public documentation and
  all supported import paths.
- [Core API](./docs/core-api.md): Component definitions, templates, lifecycle,
  types, and failure behavior.
- [Component library](./docs/component-library.md): Native `ChButton` contract.
- [Framework adapters](./docs/framework-adapters.md): React, Svelte, and Astro
  integration behavior.

## Requirements

- A browser with Custom Elements v1 for component instances. Registration is a
  no-op when `customElements` is unavailable.
- React 18+, Svelte 4+, or Astro 4+ only for the corresponding optional
  integration entrypoint.
- ESM-compatible tooling.

## Notes

Rendering replaces component content with `innerHTML`; reactive updates can
discard child state, focus, selection, and listeners. See the core API docs for
lifecycle and security constraints.

## License

Licensed under Apache-2.0.
