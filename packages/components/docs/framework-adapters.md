# @codenhub/components Framework Adapters

The framework entrypoints intentionally expose different shapes. All are
experimental and require the corresponding optional peer dependency.

## React

`@codenhub/components/lib/react` exports `createReactWrapper(definition)` and a
React `ChButton` wrapper. The wrapper synchronizes declared properties after
render, maps declared events to case-insensitive `on<Event>` props, maps
`className` to `class`, forwards an `HTMLElement` ref, and removes event
listeners on unmount.

React wrappers do not register custom elements. Register the native definition
once before rendering its wrapper:

```tsx
import { registerComponents } from "@codenhub/components";
import { ChButton as ChButtonDefinition } from "@codenhub/components/lib";
import { ChButton } from "@codenhub/components/lib/react";

registerComponents([ChButtonDefinition]);

export function SaveButton() {
  return <ChButton label="Save" variant="primary" onClick={() => console.log("saved")} />;
}
```

The React entrypoint requires React 18 or newer and actual rendering is
client-side because it depends on Custom Elements.

## Svelte

`@codenhub/components/lib/svelte` exports the native `ChButton` definition, not
a compiled Svelte component. Importing the module in a browser automatically
registers `<ch-button>`. In a server environment, registration is skipped; the
module must also load in the browser before the element can upgrade.

```svelte
<script lang="ts">
  import "@codenhub/components/lib/svelte";
</script>

<ch-button label="Save" variant="primary"></ch-button>
```

The entrypoint requires Svelte 4 or newer when used in a Svelte application.

## Astro

`@codenhub/components/lib/astro` also exports the native `ChButton` definition,
not an Astro component. Browser import automatically registers `<ch-button>`;
server import does not. Ensure the module is delivered and executed on the
client before relying on reactive custom-element behavior.

The entrypoint requires Astro 4 or newer when used in an Astro application.
