---
title: Overview
description: How the stylesheet loads in a framework build, and which guide to follow.
group: Integrating
order: 4
---

# Integrating

This package has no JavaScript and no framework bindings; see [Introduction](../index.md#what-it-does-not-do). Integrating it into a framework is entirely about where that framework lets you load a global stylesheet, and whether the project runs Tailwind CSS v4.

## The shared model

Every stack does the same two imports, from the same kind of place — a root layout, an app entry file, or a global CSS file, never a page or a component further down the tree:

1. One [entrypoint](../setup.md#import-paths) — the compiled `@codenhub/styles` for any build, or `@codenhub/styles/tw` when the project already runs Tailwind CSS v4.
2. `@codenhub/styles/aesthetics` (or `/tw/aesthetics`) after it, only if the project uses an [aesthetic](../usage/aesthetics.md).

Importing from one place matters for two reasons. Some frameworks only _allow_ global CSS from a designated root file and fail the build otherwise — Next.js's Pages Router is one, see [Next.js → Troubleshooting](./nextjs.md#troubleshooting). Where a framework allows it more broadly, as Next.js's App Router does, importing from the root remains the recommended choice for predictable CSS ordering — and importing per-component instead would load the same reset and token rules once per component rather than once per app.

## Which guide to follow

| Stack                                    | Guide                            |
| ---------------------------------------- | -------------------------------- |
| A Tailwind CSS v4 project on any bundler | [Tailwind CSS v4](./tailwind.md) |
| Next.js / React                          | [Next.js](./nextjs.md)           |
| Vue                                      | [Vue](./vue.md)                  |
| Svelte / SvelteKit                       | [Svelte](./svelte.md)            |
| Astro                                    | [Astro](./astro.md)              |

A project with no framework — a plain Vite, webpack, or Parcel build — needs nothing beyond [Setup → Quick start](../setup.md#quick-start): import the compiled stylesheet from the project's existing global CSS entry.

## Verifying it worked

After the import, render one styled element and confirm it picked up the package's tokens rather than the browser default:

```html
<button class="btn primary">Continue</button>
```

A rounded, filled button in the primary color means the stylesheet loaded. Unstyled browser-default text most often means the import specifier didn't resolve — check the [import paths table](../setup.md#import-paths) for the exact one your entrypoint needs, and confirm your build tooling resolves package CSS imports at all, see [Setup → Requirements](../setup.md#requirements).
