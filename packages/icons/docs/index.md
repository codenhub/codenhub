---
title: Overview
description: Icon registry, CSS mask generator, and scanner module for Codenhub icon system.
---

# Icons documentation

`@codenhub/icons` provides an icon registry, CSS mask generator, static class scanner, PostCSS plugin, and Vite plugin for Codenhub icon integration.

## Installation

Install `@codenhub/icons`:

```sh
pnpm add @codenhub/icons
```

## Core Features

- **IconRegistry**: Manage icon registrations, aliases, and dynamic datasets.
- **CSS Mask Generator**: Generate lightweight CSS mask rules for icons using `currentColor`.
- **Static Class Scanner**: Extract icon class names (`ic-*`) from source markup and code files.
- **Vite & PostCSS Plugins**: Automatically scan source files and inject generated icon CSS rules during build or dev server execution.

## Entrypoints

- `@codenhub/icons`: Core JavaScript API, SVG data URI converter, CSS generator, class scanner, and default IconRegistry instance.
- `@codenhub/icons/vite`: Vite plugin integration.
- `@codenhub/icons/postcss`: PostCSS plugin integration.
