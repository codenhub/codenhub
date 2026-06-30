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
import { defineComponent, html, css, unsafeHTML, TemplateResult, registerComponents } from "@codenhub/components";
import type {
  ComponentConfig,
  ComponentDefinition,
  ComponentInstance,
  ComponentProperties,
  ComponentProps,
  PropertyConfig,
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

- **Errors thrown**:
  - Throws `Error` if the `tagName` is invalid (e.g. does not contain a hyphen, does not start with a lowercase letter, or contains invalid characters).
  - Throws `Error` if `tagName` is a reserved SVG/HTML custom element tag name.
  - Throws `Error` if `config.render` is not a function.
  - Throws `Error` if a property or method name conflicts or uses a reserved name (such as `constructor`, `requestUpdate`, `connectedCallback`, etc.).
  - During execution, property setters will throw a parsing `Error` if a property declared as `Object` or `Array` receives a string value that cannot be parsed as JSON.
  - During rendering, if `hasShadow` is true but the shadow root content wrapper element is removed or missing from the DOM, a render `Error` is thrown to prevent clobbering other nodes.

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

- **HTML Escaping**: Automatically escapes dynamic values to prevent Cross-Site Scripting (XSS) attacks. Standard strings, numbers, objects, and arrays are escaped during serialization.
- **Unsafe HTML**: To bypass escaping and insert raw, unescaped HTML, wrap the value in `unsafeHTML(value)`.
- **Template Nesting**: Nested `TemplateResult` objects (e.g., returned from nested `html` calls) are inserted raw without escaping, allowing template composition.
- Objects are serialized with `JSON.stringify` (unless they define a custom `toString` method).
- Arrays are mapped recursively through these serialization rules and joined as a single string.
- `null` and `undefined` produce empty strings.
- All other values are converted via `String()`.

#### `unsafeHTML`

Bypasses automatic HTML escaping in the `html` helper.

```ts
import { html, unsafeHTML } from "@codenhub/components";

const rawMarkup = unsafeHTML("<span>Raw HTML</span>");
const template = html`
  <div>${rawMarkup}</div>
`;
```

> [!WARNING]
> Only use `unsafeHTML` with trusted or sanitized inputs. Passing unsanitized user input directly to `unsafeHTML` will introduce XSS vulnerabilities.

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

- **Errors thrown**:
  - Throws `TypeError` if an array or a plain object (without a custom `toString` method) is interpolated.

#### `TemplateResult`

Class representing a trusted, pre-serialized HTML string. Returned by `html`
and `unsafeHTML`. You will encounter this type as the return type of `render`.

```ts
import type { TemplateResult } from "@codenhub/components";
```

When a `TemplateResult` is interpolated inside another `html` expression, its
content is inserted **raw** without escaping, enabling safe template
composition:

```ts
const item = (label: string) => html`
  <li>${label}</li>
`;
const list = html`
  <ul>
    ${items.map(item)}
  </ul>
`;
```

| Member       | Type           | Description                      |
| ------------ | -------------- | -------------------------------- |
| `value`      | `string`       | The raw, serialized HTML string. |
| `toString()` | `() => string` | Returns `value`.                 |

---

### `ComponentConfig<Props, Methods>`

| Property     | Type                                                    | Default  | Description                                                                                                                         |
| ------------ | ------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `properties` | `Record<string, PropertyConstructor \| PropertyConfig>` | `{}`     | Reactive property declarations with type constructors or property descriptor objects.                                               |
| `hasShadow`  | `boolean`                                               | `false`  | Attach Shadow DOM. Enables `styles` and scoped CSS.                                                                                 |
| `styles`     | `string`                                                | —        | CSS injected into Shadow DOM. Only used when `hasShadow` is `true`.                                                                 |
| `render`     | `(this: Instance) => string \| TemplateResult`          | required | Returns HTML string or TemplateResult representing the component's current state.                                                   |
| `onMount`    | `(this: Instance) => void`                              | —        | Called once after the initial render when the element is first inserted into the document. DOM is already populated when this runs. |
| `onUnmount`  | `(this: Instance) => void`                              | —        | Called after removal from the document.                                                                                             |
| `onUpdate`   | `(this: Instance) => void`                              | —        | Called after every render, including the initial one. Fires before `onMount` on first connect.                                      |
| `methods`    | `Methods`                                               | `{}`     | Custom methods bound to the instance.                                                                                               |

#### Reactive properties

Declaring a property in `properties` installs a getter/setter on the element.
Assigning a new value automatically schedules a batched re-render in the next
micro-task. Attribute changes are forwarded to the matching property setter.

Properties can be declared using a type constructor directly, or via a property descriptor object to define default values:

```ts
const MyComponent = defineComponent("my-component", {
  properties: {
    // Type constructor declaration (default is undefined)
    name: String,
    // Property descriptor object declaration with default value
    clicks: { type: Number, default: 0 },
    // Descriptor with function factory for objects/arrays to avoid shared references
    items: { type: Array, default: () => [] },
  },
  ...
});
```

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
- **Custom Classes / Converters**: parsed or constructed by calling/instantiating the function (e.g. `Date` or user class), unless the value is already an instance. For transpiled ES5 classes, you can pass a custom factory function (e.g. `(val) => new MyClass(val)`) to ensure correct invocation.
- **`undefined`**: passes through unchanged for all property types. An `undefined` value means the property has not been initialized and is preserved as-is.

---

### `ComponentDefinition<Props, Methods>`

| Property        | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `tagName`       | The tag name passed to `defineComponent`.                                |
| `elementClass`  | The `HTMLElement` subclass. Pass directly to `customElements.define`.    |
| `create(props)` | Creates a new element instance. Optionally sets initial property values. |

---

### `ComponentInstance<Props, Methods>`

The full type of a live element instance. Intersects `HTMLElement` with reactive
properties (`ComponentProps<Props>`), custom methods (`Methods`), and the built-in
`requestUpdate()` method.

Use this type when you need to annotate a variable that holds a reference to a
created or queried element outside the call site where the type is inferred.

```ts
import type { ComponentInstance } from "@codenhub/components";
```

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

- `innerHTML` is replaced on every render. Event listeners attached directly to child elements inside `onUpdate` are garbage-collected along with the discarded DOM nodes when the next render occurs. However, avoid attaching listeners to persistent external elements or the host element itself inside `onUpdate` to prevent memory leaks and duplicate execution.
- **Interactive State & Focus Loss**: Since `innerHTML` is replaced on every render, interactive elements (like `<input>`, `<textarea>`, or custom dropdowns) are destroyed and recreated. This results in immediate loss of focus, selection, and cursor position. To prevent this, avoid reactive property updates while inputs are actively focused, or manage form/input focus state manually.
- **Lifecycle call order on first connect**: render → `onUpdate` → `onMount`.
  The DOM is fully populated before `onMount` runs, so it is safe to query
  child elements there. `onUpdate` fires before `onMount` on the initial render
  and after every subsequent render. The first-connect `onUpdate` call is
  **synchronous** (runs during `connectedCallback`). All subsequent `onUpdate`
  calls are **deferred to the next microtask** after a reactive property change.
- Shadow DOM styles are preserved across renders via a retained `<style>` node.
  The rendered content is placed inside a `<div style="display:contents">` inside
  the Shadow Root, making the wrapper transparent to flex and grid layouts so
  child elements behave as direct children of `:host`.
- `customElements.define` is called only once per tag name; calling
  `registerComponents` multiple times with the same component is safe.
- This package has no runtime dependencies.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
