---
title: Core API
---

# Core component API

Import the core surface from `@codenhub/components`.

## Component definitions

`defineComponent(tagName, config)` returns a `ComponentDefinition` containing
the generated `elementClass`, declarations, tag name, and a `create(props?)`
factory. It does not register the custom element. Call
`registerComponents(definitions)` to register definitions in the browser's
global registry; existing tag names are skipped, and registration is a no-op
when `customElements` is unavailable.

Tag names must start with a lowercase letter, contain a hyphen, use valid custom
element characters, and not be reserved. `defineComponent` also rejects a
non-function renderer and property or method names that collide with reserved,
native, or duplicate names.

```ts
import { defineComponent, html, registerComponents } from "@codenhub/components";

const Counter = defineComponent("demo-counter", {
  properties: { count: { type: Number, default: 0 } },
  methods: {
    increment() {
      this.count = (this.count ?? 0) + 1;
    },
  },
  render() {
    return html`
      <button>Count: ${this.count}</button>
    `;
  },
  onUpdate() {
    this.querySelector("button")?.addEventListener("click", this.increment);
  },
});

registerComponents([Counter]);
```

### Configuration

`ComponentConfig` supports:

| Property         | Behavior                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `properties`     | Reactive declarations using a constructor or `PropertyConfig`; changes batch a render into the next microtask. |
| `events`         | Event metadata consumed by framework wrappers; it does not dispatch events.                                    |
| `formAssociated` | Enables native form association and the instance `internals` property when the browser supports it.            |
| `hasShadow`      | Attaches an open Shadow Root when supported. Defaults to Light DOM.                                            |
| `styles`         | Adds styles to the Shadow Root, or once to `document.head` for Light DOM.                                      |
| `render`         | Required function returning a string or `TemplateResult`.                                                      |
| `onUpdate`       | Runs after every render, before `onMount` on first connection.                                                 |
| `onMount`        | Runs after the initial render when connected.                                                                  |
| `onUnmount`      | Runs after disconnection; consumers clean up external resources here.                                          |
| `methods`        | Methods bound to the component instance.                                                                       |

Rendering replaces Light DOM `innerHTML`, or the dedicated Shadow DOM content
wrapper, on every update. Child nodes, listeners, focus, selection, and
uncontrolled form state may therefore be lost. `requestUpdate()` schedules the
same batched update used by reactive property setters.

The `internals` getter throws when the component is not form-associated or the
environment cannot provide `ElementInternals`. Rendering throws if consumer
code removes the package-owned Shadow DOM content wrapper. Invalid JSON strings
assigned to `Object` or `Array` properties also throw.

## Property conversion

`PropertyConstructor` accepts `String`, `Number`, `Boolean`, `Object`, `Array`,
custom classes, or converter functions. `PropertyType<T>` resolves the value
type. `PropertyConfig<T>` adds a default value or per-instance default factory.
`ComponentProperties` is the declaration map, and `ComponentProps<Props>` is
its resolved props shape.

- Boolean attributes follow presence rules; `"false"` and attribute removal
  become `false`.
- Empty or whitespace-only number attributes become `NaN`.
- Object and array strings use `JSON.parse` and throw on invalid input.
- `undefined` remains `undefined`.

## Templates

`html` returns a `TemplateResult` and escapes interpolated values. Nested
`TemplateResult` values compose as trusted markup. Arrays are serialized
recursively, plain objects use `JSON.stringify`, and nullish values render as an
empty string.

`unsafeHTML(value)` returns a trusted `TemplateResult` without escaping. Only
pass trusted or sanitized content because untrusted input creates an XSS risk.

`css` returns a CSS string and accepts primitive or custom-stringifiable
interpolations. It throws `TypeError` for arrays, `TemplateResult`, and plain
objects without a custom `toString` method.

## Public types

| Type                  | Purpose                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `ComponentConfig`     | Factory configuration and lifecycle hooks.                                    |
| `ComponentDefinition` | Generated element class, factory, declarations, and tag name.                 |
| `ComponentInstance`   | `HTMLElement` plus reactive props, methods, `requestUpdate`, and `internals`. |
| `ComponentProperties` | Property declaration map.                                                     |
| `ComponentProps`      | Resolved values for a property declaration map.                               |
| `PropertyConfig`      | Property constructor plus optional default.                                   |
| `PropertyConstructor` | Supported built-in or custom converter constructor.                           |
| `PropertyType`        | Type-level conversion from a constructor to its value.                        |
