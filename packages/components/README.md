# @codenhub/components

Lightweight wrapper around the browser's native **Web Components** API.
Build fast-loading, framework-agnostic SPA UIs with zero JSX, zero compile-time
templating, and zero magic. Reactive properties, scoped Shadow DOM, and
clean lifecycle hooks — all on top of standard `HTMLElement`.

## Installation

```sh
pnpm add @codenhub/components
```

## Usage

Define a component with `defineComponent`, register it with
`registerComponents`, then append it to the DOM or reference it in HTML.

```ts
import { defineComponent, html, css, registerComponents } from "@codenhub/components";

const UserCard = defineComponent("user-card", {
  properties: {
    name: String,
    role: String,
    clicks: Number,
  },
  styles: css`
    .card {
      border: 1px solid #ccc;
      padding: 16px;
    }
  `,
  onMount() {
    console.log("Mounted!");
  },
  onUpdate() {
    // Bind events after every render — safe because innerHTML is replaced.
    this.querySelector(".btn-increment")?.addEventListener("click", this.increment);
  },
  onUnmount() {
    console.log("Unmounted!");
  },
  render() {
    const { name, role, clicks } = this;
    return html`
      <div class="card">
        <h3>${name}</h3>
        <p>Role: ${role}</p>
        <button class="btn-increment">Clicks: ${clicks}</button>
      </div>
    `;
  },
  methods: {
    increment() {
      this.clicks = (this.clicks ?? 0) + 1;
    },
  },
});

registerComponents([UserCard]);

// Programmatic creation
const card = UserCard.create({ name: "Ada", role: "Engineer", clicks: 0 });
document.body.appendChild(card);
```

## Reference

Supported import paths:

| Path                   | Description                           |
| ---------------------- | ------------------------------------- |
| `@codenhub/components` | Core component factory and utilities. |

### `@codenhub/components`

```ts
import { defineComponent, html, css, registerComponents } from "@codenhub/components";
import type {
  ComponentConfig,
  ComponentDefinition,
  ComponentProperties,
  ComponentProps,
  PropertyConstructor,
  PropertyType,
} from "@codenhub/components";
```

#### `defineComponent(tagName, config)`

Creates a `ComponentDefinition` from a plain configuration object.
Does **not** register the element in `customElements` — call
`registerComponents` for that.

| Parameter | Type                              | Description                                                        |
| --------- | --------------------------------- | ------------------------------------------------------------------ |
| `tagName` | `string`                          | Custom element tag name. Must contain a hyphen (e.g. `"my-card"`). |
| `config`  | `ComponentConfig<Props, Methods>` | Component options — see `ComponentConfig` below.                   |

Returns: `ComponentDefinition<Props, Methods>`

#### `registerComponents(components)`

Registers one or more `ComponentDefinition` objects in the browser's global
`customElements` registry. Safely skips tags that are already registered.

In non-browser environments where `customElements` is unavailable (SSR, Node.js),
this function is a no-op and returns immediately without throwing.

| Parameter    | Type                    | Description              |
| ------------ | ----------------------- | ------------------------ |
| `components` | `ComponentDefinition[]` | Definitions to register. |

#### `html`

Tagged template literal helper for HTML markup.

```ts
const markup = html`
  <h1>${title}</h1>
`;
```

- Objects are serialized with `JSON.stringify`.
- `null` and `undefined` produce empty strings.
- All other values are converted via `String()`.

> [!WARNING]
> This helper does NOT perform HTML escaping or sanitization.
> To prevent Cross-Site Scripting (XSS) attacks, ensure any user-controlled
> input interpolated here is sanitized first (e.g. using a DOM sanitization library).

#### `css`

Tagged template literal helper for CSS strings. Enables editor syntax
highlighting. Returns the processed CSS string with interpolated values inlined.

```ts
const styles = css`
  .card {
    border: 1px solid ${borderColor};
  }
`;
```

---

### `ComponentConfig<Props, Methods>`

| Property     | Type                                  | Default  | Description                                                         |
| ------------ | ------------------------------------- | -------- | ------------------------------------------------------------------- |
| `properties` | `Record<string, PropertyConstructor>` | `{}`     | Reactive property declarations with type constructors.              |
| `hasShadow`  | `boolean`                             | `false`  | Attach Shadow DOM. Enables `styles` and scoped CSS.                 |
| `styles`     | `string`                              | —        | CSS injected into Shadow DOM. Only used when `hasShadow` is `true`. |
| `render`     | `(this: Instance) => string`          | required | Returns HTML string for the component's current state.              |
| `onMount`    | `(this: Instance) => void`            | —        | Called once after the initial render when the element is first inserted into the document. DOM is already populated when this runs. |
| `onUnmount`  | `(this: Instance) => void`            | —        | Called after removal from the document.                             |
| `onUpdate`   | `(this: Instance) => void`            | —        | Called after every render, including the initial one. Fires before `onMount` on first connect. |
| `methods`    | `Methods`                             | `{}`     | Custom methods bound to the instance.                               |

#### Reactive properties

Declaring a property in `properties` installs a getter/setter on the element.
Assigning a new value automatically schedules a batched re-render in the next
micro-task. Attribute changes are forwarded to the matching property setter.

Supported constructor types:

| Constructor | TypeScript type           |
| ----------- | ------------------------- |
| `String`    | `string`                  |
| `Number`    | `number`                  |
| `Boolean`   | `boolean`                 |
| `Object`    | `Record<string, unknown>` |
| `Array`     | `unknown[]`               |

String attributes are cast automatically:

- **`Boolean`**: standard HTML attribute rules apply. The empty string `""` (attribute presence) and `"true"` cast to `true`. `"false"` and `null` (attribute absence/removal) cast to `false`.
- **`Number`**: parsed via `Number(val)`. Empty or whitespace-only strings cast to `NaN` to prevent silent coercion to `0`.
- **`Object`/`Array`**: parsed via `JSON.parse`. If parsing fails, an explicit `Error` is thrown to fail fast.
- **`undefined`**: passes through unchanged for all property types. An `undefined` value means the property has not been initialized and is preserved as-is.

---

### `ComponentDefinition<Props, Methods>`

| Property        | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `tagName`       | The tag name passed to `defineComponent`.                                |
| `elementClass`  | The `HTMLElement` subclass. Pass directly to `customElements.define`.    |
| `create(props)` | Creates a new element instance. Optionally sets initial property values. |

## Examples

### Shadow DOM with scoped styles

```ts
const Badge = defineComponent("ui-badge", {
  properties: { label: String, color: String },
  hasShadow: true,
  styles: css`
    :host {
      display: inline-block;
    }
    span {
      background: var(--color);
      padding: 2px 8px;
      border-radius: 4px;
    }
  `,
  render() {
    return html`
      <span style="--color: ${this.color}">${this.label}</span>
    `;
  },
});

registerComponents([Badge]);
document.body.appendChild(Badge.create({ label: "New", color: "#3b82f6" }));
```

### Setting properties from HTML attributes

```html
<user-card name="Alice" role="Admin" clicks="0"></user-card>
```

String attributes are cast to the declared property type automatically.

### Programmatic navigation alongside `@codenhub/router`

```ts
import { createRouter } from "@codenhub/router";

createRouter()
  .on("/profile", () => {
    const card = UserCard.create({ name: "Alice", role: "Admin", clicks: 0 });
    document.getElementById("app")!.replaceChildren(card);
  })
  .start();
```

## Requirements

- **Browser**: any browser supporting Custom Elements v1 and Shadow DOM v1
  (all evergreen browsers).
- **Browser APIs used**: `customElements`, `HTMLElement`, `ShadowRoot`,
  `document.createElement`, `Element.setAttribute`, and the microtask
  scheduler via `Promise.resolve()` for batched re-renders.
- **SSR**: not supported. This package is pure client-side. `registerComponents`
  is a safe no-op in non-browser environments.
- **Build tools**: none required at runtime. TypeScript users need a bundler
  configured for ESM (e.g. Vite, esbuild, tsdown).

## Notes

- `innerHTML` is replaced on every render. Prefer `onUpdate` for event binding
  rather than inline `onclick` attributes to avoid stale listeners.
- **Lifecycle call order on first connect**: render → `onUpdate` → `onMount`.
  The DOM is fully populated before `onMount` runs, so it is safe to query
  child elements there. `onUpdate` fires before `onMount` on the initial render
  and before any subsequent re-render.
- Shadow DOM styles are preserved across renders via a retained `<style>` node.
- `customElements.define` is called only once per tag name; calling
  `registerComponents` multiple times with the same component is safe.
- This package has no runtime dependencies.

## License

Apache-2.0
