---
title: Tailwind CSS
description: One import makes every non-brand family resolvable; Tailwind emits only the icons your markup used.
order: 2
---

# Tailwind CSS v4

If your project already runs Tailwind CSS v4, adding icons takes one import — zero plugin config required, and Tailwind emits only the icons your templates actually wrote:

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Every family the package ships is resolvable out of the box except the brand families `simple-icons` and `logos`, which require declaring `@plugin` yourself with `families` (below). Loading the families costs about 150–190 ms and 112 MB once per build, both brand families included, against about 35 ms and 53 MB for a single family; a project using three icons ends up with about 10 KB of CSS.

## Configuring the plugin

When you want to restrict families, set a default prefix, change the class prefix, or opt into brand icons, declare `@plugin "@codenhub/icons/tailwind"` directly instead of importing `/tw` (which already declares it with no options):

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
| `families`     | Family prefixes to resolve against. Defaults to all but brand ones.   |
| `default`      | Family that unqualified names resolve against. There is no default.   |
| `prefix`       | Class prefix. Defaults to `ic`.                                       |
| `stroke-width` | Applied to stroke-based families that carry no modifier of their own. |
| `attribution`  | `auto` or `off`. See [Licensing](../licensing.md).                    |

Notice one honest quirk: narrowing `families` does not make the build faster or lighter in memory. Because a Tailwind plugin handler has to run synchronously — utilities registered after an `await` are quietly dropped — every family is already loaded before your options are read. What `families` controls is which names can resolve and which license notices your built CSS carries.

## Motion

Motion classes and `ic-on-hover` work as Tailwind utilities, matching [Motion](../concepts.md#motion): `ic-on-hover` plays the motion while the icon, its parent, or an `ic-trigger` ancestor is hovered or focused, once per hover unless `--ic-anim-iterations` says otherwise, and it controls animated artwork as well:

```html
<button>
  <i class="ic-lucide-refresh-cw ic-anim-spin ic-on-hover" aria-hidden="true"></i>
  Reload
</button>
```

Because motion classes are real Tailwind utilities, Tailwind's variants remain available for other triggers. A variant replaces `ic-on-hover` for glyph motion and repeats until the state ends:

```html
<button class="group">
  <i class="ic-lucide-loader-circle group-hover:ic-anim-spin" aria-hidden="true"></i>
  Refresh
</button>
<i class="ic-lucide-bell hover:ic-anim-wiggle" aria-hidden="true"></i>
```

When using variants, pair `group-focus-visible:ic-anim-spin` with `group-hover:ic-anim-spin` so keyboard users get the same cue; `ic-on-hover` handles focus automatically. Reduced-motion preferences disable animations even when a variant matches. Animated artwork has no variant form, so keep `ic-on-hover` beside the icon class for those. See [Motion](../concepts.md#motion) for all five classes, defaults, custom prefixes, and CSS-mask animation limits.

## Attribution

`@import "@codenhub/icons/tw"` inlines a static stylesheet, so it carries an ordinary `/*! … */` banner naming every family it resolves — a superset notice that is always safe. Declaring `@plugin` yourself narrows resolution, and there the notice travels as a `--ic-attribution-<family>` custom property on `:root` instead, emitted once per family the build actually used. See [Licensing](../licensing.md).

## See also

- [Delivery methods](index.md) — how the methods compare.
- [Vite plugin](vite.md) — the next delivery method, for Vite builds without Tailwind.
- [Frameworks](../frameworks/index.md) — framework-specific wiring once you have picked a delivery method.
- [Concepts](../concepts.md) — name resolution and stroke width.
