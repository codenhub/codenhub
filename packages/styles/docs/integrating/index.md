---
title: Integrating
description: Wiring the stylesheet into a framework or build target.
---

# Integrating

This package has no JavaScript and no framework bindings; see
[Introduction](../index.md#what-it-does-not-do). Integrating it into a
framework is entirely about where that framework loads a global stylesheet,
and whether the project runs Tailwind CSS v4.

Every stack does the same two things:

1. Import one [entrypoint](../setup.md#import-paths) — the compiled
   `@codenhub/styles` for any build, or `@codenhub/styles/tw` when the
   project already runs Tailwind CSS v4 — from wherever that framework loads
   global CSS.
2. Import `@codenhub/styles/aesthetics` (or `/tw/aesthetics`) after it, only
   if the project uses an [aesthetic](../usage/aesthetics.md).

| Stack                                    | Guide                            |
| ---------------------------------------- | -------------------------------- |
| A Tailwind CSS v4 project on any bundler | [Tailwind CSS v4](./tailwind.md) |
| Next.js / React                          | [Next.js](./nextjs.md)           |
| Vue                                      | [Vue](./vue.md)                  |
| Svelte / SvelteKit                       | [Svelte](./svelte.md)            |
| Astro                                    | [Astro](./astro.md)              |

A project with no framework — a plain Vite, webpack, or Parcel build — needs
nothing beyond [Setup](../setup.md#quick-start): import the compiled
stylesheet from the project's existing global CSS entry.
