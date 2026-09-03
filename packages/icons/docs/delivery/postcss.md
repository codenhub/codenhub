---
title: PostCSS plugin
description: Scans the stylesheet and the files you list, then appends the base rules and the mask rules those classes need.
order: 4
---

# PostCSS plugin

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

It takes the same `families`, `defaultPrefix`, `prefix`, and `strokeWidth` options as the [Vite plugin](vite.md). PostCSS has no asset pipeline, so `attribution` accepts `auto` and `off` only, and there is no `mode: "svg"`.

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

Unlike the Vite plugin, this plugin has no view of the bundler's module graph. When it processes a stylesheet it scans that stylesheet's own text and every path in `content`, and nothing else. List globs that cover wherever your icon classes are written — components, templates, HTML — or only classes that literally appear in the CSS will resolve:

```ts
postcssIcons({
  content: ["./app/**/*.{tsx,jsx,mdx}", "./components/**/*.{tsx,jsx}"],
  families: [lucide],
  defaultPrefix: "lucide",
});
```

The plugin runs once per stylesheet it processes, so apply it to a single global stylesheet rather than to every CSS module.

## See also

- [Delivery methods](index.md) — how the methods compare.
- [Frameworks: Next.js](../frameworks/nextjs.md) — the main reason to reach for PostCSS over Vite.
