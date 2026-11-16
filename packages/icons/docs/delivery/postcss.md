---
title: PostCSS plugin
description: Scans the stylesheet and the files you list, then appends the base rules and the mask rules those classes need.
order: 4
---

# PostCSS plugin

For builds that run PostCSS without Vite or Tailwind — most often Next.js — the PostCSS plugin scans your stylesheets and `content` globs, then appends the base rules and just the mask rules your markup uses.

```ts
import lucide from "@codenhub/icons/data/lucide";
import postcssIcons from "@codenhub/icons/postcss";

postcssIcons({
  content: ["./src/**/*.html"],
  families: [lucide],
  defaultPrefix: "lucide",
  injectBase: true,
  attribution: "auto",
});
```

It shares the same `families`, `defaultPrefix`, `prefix`, and `strokeWidth` options as the [Vite plugin](vite.md). Because PostCSS has no asset pipeline of its own, `attribution` accepts `auto` and `off` only, and there is no `mode: "svg"`.

| Option          | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `content`       | Files and globs to scan for icon classes.                          |
| `families`      | Families to resolve against. Nothing is bundled by default.        |
| `defaultPrefix` | Family an unqualified name resolves against.                       |
| `injectBase`    | Whether to append the base `.ic` rules. Defaults to `true`.        |
| `prefix`        | Class prefix. Defaults to `ic`.                                    |
| `strokeWidth`   | Default for stroke-based families whose classes carry no modifier. |
| `attribution`   | `auto` or `off`. See [Licensing](../licensing.md).                 |

## Scanning

Unlike the Vite plugin, this plugin has no visibility into the bundler's module graph. When it runs on a stylesheet, it sees only that stylesheet's own text and the files matched by `content` — nothing else. List globs covering everywhere your icon classes live (components, templates, HTML), or only classes written literally inside your CSS will resolve:

```ts
postcssIcons({
  content: ["./app/**/*.{tsx,jsx,mdx}", "./components/**/*.{tsx,jsx}"],
  families: [lucide],
  defaultPrefix: "lucide",
});
```

The plugin runs once for every stylesheet it processes, so attach it to a single global stylesheet rather than running it across every CSS module.

## See also

- [Delivery methods](index.md) — how the methods compare.
- [Frameworks](../frameworks/index.md) — next on the reading path, covering Astro, Next.js, and SvelteKit.
- [Frameworks: Next.js](../frameworks/nextjs.md) — the main reason to reach for PostCSS over Vite.
