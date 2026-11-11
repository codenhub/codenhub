---
title: Overview
description: How the stylesheet loads in a framework build, and which guide to follow.
group: Integrating
order: 2
---

# Integrating

This section is a detour from the main reading path, for projects whose framework decides where global CSS may go. The package has no JavaScript and no framework bindings (see [Introduction](../index.md#what-it-does-not-do)), so integrating it is only about two things: where your framework lets you load a global stylesheet, and whether the project runs Tailwind CSS v4. Follow the one guide that matches your stack, then return to [Building a screen](../concepts.md).

## The shared model

Every stack does the same two imports, from the same kind of place — a root layout, an app entry file, or a global CSS file, never a page or a component further down the tree:

1. One [entrypoint](../setup.md#all-entrypoints) — the compiled `@codenhub/styles` for any build, or `@codenhub/styles/tw` when the project already runs Tailwind CSS v4.
2. `@codenhub/styles/aesthetics` (or `/tw/aesthetics`) after it, only if the project uses an [aesthetic](../usage/aesthetics.md).

Importing from one place matters for two reasons. Some frameworks only _allow_ global CSS from a designated root file and fail the build otherwise — Next.js's Pages Router is one, see [Next.js → Troubleshooting](./nextjs.md#troubleshooting). Where a framework allows it more broadly, as Next.js's App Router does, importing from the root remains the recommended choice for predictable CSS ordering — and importing per-component instead would load the same reset and token rules once per component rather than once per app.

## Which guide to follow

| Stack                                                                         | Guide                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------- |
| A Tailwind CSS v4 project on any bundler                                      | [Tailwind CSS v4](./tailwind.md)            |
| Next.js / React                                                               | [Next.js](./nextjs.md)                      |
| Vue                                                                           | [Vue](./vue.md)                             |
| Svelte / SvelteKit                                                            | [Svelte](./svelte.md)                       |
| Astro                                                                         | [Astro](./astro.md)                         |
| Plain HTML, Rails, Laravel, Django, or any app with no Node.js CSS build step | [Without a bundler](./without-a-bundler.md) |

A project with no framework — a plain Vite, webpack, or Parcel build — imports the compiled stylesheet from the project's existing global CSS entry, as [Setup → Import the stylesheet](../setup.md#import-the-stylesheet) shows. Vite and webpack resolve the package name as it is; Parcel and PostCSS with `postcss-import` need the change below. The compiled stylesheet holds every class; to ship only the ones your pages use without adopting Tailwind, write a trimmed stylesheet with the package's [`build` command](./without-a-bundler.md#build-only-the-classes-you-use) and import that instead.

### Bundlers that need a nudge

Both tools find the stylesheet once they are told how; neither needs a different entrypoint.

**Parcel.** Turn on its support for a package's `exports` map in your `package.json`:

```json
{
  "@parcel/resolver-default": {
    "packageExports": true
  }
}
```

Then import the package with Parcel's `npm:` prefix, which tells it the name is a package and not a file next to the stylesheet:

```css
@import "npm:@codenhub/styles";
```

**PostCSS with `postcss-import`.** The plugin does not read a package's `exports` map, so the package name alone does not resolve. Import the compiled file by its path on disk instead, relative to your own stylesheet, the same file a `<link>` would name:

```css
@import "../node_modules/@codenhub/styles/dist/index.css";
```

The other compiled entrypoints work the same way, such as `@codenhub/styles/dist/aesthetics/neobrutalism.css`.

## Verifying it worked

After the import, render one styled element and confirm it picked up the package's tokens rather than the browser default:

```html
<button class="btn primary">Save changes</button>
```

A rounded button filled with the primary color (near-black on a light page, near-white on a dark one) means the stylesheet loaded. Unstyled browser-default text most often means the import specifier didn't resolve — check the [entrypoint table](../setup.md#all-entrypoints) for the exact specifier to import, and confirm your build tooling resolves package CSS imports at all, see [Setup → Requirements](../setup.md#requirements). With no build tool, link the file by its path instead; see [Without a bundler](./without-a-bundler.md). [Setup → When nothing is styled](../setup.md#when-nothing-is-styled) lists the other common causes.

## Next

Once the button renders, go back to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page.
