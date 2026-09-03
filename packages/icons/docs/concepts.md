---
title: Concepts
description: Families, name resolution, reserved names, stroke width, and the markup forms — the model every delivery method shares.
order: 1
---

# How the icon system fits together

Every delivery method reads the same classes and shares the same model. This page describes that model once, independent of which method you use.

## Families

An icon family is a namespace of icons with its own prefix, geometry, and license, such as `lucide` or `material-symbols-rounded-fill`. Families are data, generated from their upstream projects and shipped as modules:

```ts
import lucide from "@codenhub/icons/data/lucide";
import phosphorFill from "@codenhub/icons/data/phosphor-fill";
```

Available families:

| Prefix                                                           | Icons     | Style                   | License    |
| ---------------------------------------------------------------- | --------- | ----------------------- | ---------- |
| `lucide`                                                         | 2034      | outlined, stroke-based  | ISC        |
| `phosphor`                                                       | 1512      | outlined                | MIT        |
| `phosphor-thin`, `phosphor-light`, `phosphor-bold`               | 1512 each | outlined, other weights | MIT        |
| `phosphor-fill`                                                  | 1512      | filled                  | MIT        |
| `phosphor-duotone`                                               | 1512      | duotone                 | MIT        |
| `material-symbols-outlined`, `-rounded`, `-sharp`                | 3899 each | outlined                | Apache-2.0 |
| `material-symbols-outlined-fill`, `-rounded-fill`, `-sharp-fill` | 3899 each | filled                  | Apache-2.0 |

Variants such as filled or duotone are separate families rather than options on one, so resolution stays a prefix and a name.

## Names

An icon is identified by `prefix:name`. A class writes that with a dash, because a class name cannot contain a colon:

```html
<i class="ic-lucide-heart"></i> <i class="ic-material-symbols-rounded-home"></i>
```

The longest matching family prefix wins, so `material-symbols-outlined` is preferred over `material` when both are loaded.

An unqualified name resolves against a default family, and against nothing at all when none is configured. The package names no default of its own and ships no curated map of semantic names: `ic-close` means whatever the family you chose calls `close`, and renders nothing if that family has no such icon. Lucide's is named `x`, so under Lucide you write `ic-x`.

Where the default comes from depends on the delivery method:

| Method        | Default family                       |
| ------------- | ------------------------------------ |
| Vite, PostCSS | The `defaultPrefix` option.          |
| Tailwind      | The `default:` plugin option.        |
| Plain CSS     | The last family stylesheet imported. |

```ts
import { IconRegistry } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

registry.resolve("heart"); // lucide:heart
registry.resolve("close"); // undefined -- lucide calls it "x"
```

## Reserved names

`ic-after` and `ic-bg` are modifiers rather than icons, so `after` and `bg` cannot be family prefixes. Generation refuses a family that claims one. Stroke width is written on the icon class itself, so it claims no prefix.

## Markup

```html
<!-- standalone -->
<i class="ic-lucide-search" aria-hidden="true"></i>

<!-- leading icon on any container, through ::before -->
<button class="btn ic-lucide-check">Submit</button>

<!-- trailing icon, through ::after -->
<a class="nav-link ic-lucide-arrow-right ic-after">Next</a>

<!-- form controls take a background-image instead of a mask -->
<input class="ic-lucide-search" />

<!-- stroke width, for stroke-based families only -->
<i class="ic-lucide-heart/1.5"></i>
```

Size and color follow CSS custom properties:

```css
.toolbar {
  --ic-size: 1.25rem;
  --ic-color: var(--color-accent);
}
```

## Stroke width

Stroke width is a modifier on the icon class, and only families drawn with strokes answer to it. Of the bundled families, Lucide is the only one; the rest are drawn as filled paths and ignore it.

```html
<i class="ic-lucide-heart/1.5"></i> <i class="ic-lucide-heart/3"></i>
```

The width is baked into the artwork the rule carries, so it cannot be a second class applied on top: `ic-heart` and `ic-heart/1.5` are two icons, not one icon and a switch. One class is one rule, so a project pays for the widths it wrote and no others.

That is also why the modifier needs a build step. It works under Vite, PostCSS, and Tailwind, all of which see your markup; the plugin-free family stylesheets render at the family's authored width, because nothing there can know which widths to prepare.
