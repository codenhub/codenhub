---
title: Tailwind CSS
description: One import makes every family resolvable; Tailwind emits only the icons your markup used.
order: 2
---

# Tailwind CSS v4

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Every family the package ships is resolvable, and Tailwind emits only the icons your markup used. Loading all 13 families costs about 130 ms and 100 MB once per build; a project using three icons ends up with about 10 KB of CSS.

## Configuring the plugin

To pass options, declare the plugin yourself instead of importing `/tw`, which already declares it with no options:

```css
@import "tailwindcss";
@import "@codenhub/icons";
@plugin "@codenhub/icons/tailwind" {
  families: lucide, phosphor-fill;
  default: lucide;
  stroke-width: 1.5;
}
```

| Option         | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `families`     | Family prefixes to resolve against. Defaults to all of them.          |
| `default`      | Family that unqualified names resolve against. There is no default.   |
| `prefix`       | Class prefix. Defaults to `ic`.                                       |
| `stroke-width` | Applied to stroke-based families that carry no modifier of their own. |
| `attribution`  | `auto` or `off`. See [Licensing](../licensing.md).                    |

`families` does not make the build cheaper. A Tailwind plugin handler has to be synchronous — utilities registered after an `await` are dropped — so every family is already loaded by the time the options are read. It decides which names resolve, and which notices the output can carry.

## Attribution

`@import "@codenhub/icons/tw"` inlines a static file, so it carries an ordinary `/*! … */` banner naming every bundled family — a superset notice, which is always safe. Declaring the plugin yourself with `@plugin` narrows resolution, and there the notice is a `--ic-attribution-<family>` custom property on `:root` instead, one per family the build actually used. See [Licensing](../licensing.md).

## See also

- [Delivery methods](index.md) — how the methods compare.
- [Concepts](../concepts.md) — name resolution and stroke width.
