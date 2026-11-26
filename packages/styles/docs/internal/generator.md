---
status: APPROVED
last_updated: 2026-11-25
scope: Decisions taken so far on a build step that writes, rather than trims, the rules a project's files use, and the questions still open before it is built.
---

# Generator

## Purpose

A project that does not run Tailwind gets StyleKit's components and its layout and content helpers, such as `stack`, `cluster`, and `auto-grid`, and nothing finer: `class="flex gap-4 mt-6 text-center"` does nothing there. The generator closes that gap. It writes, for the classes a project's files name, the rules of a closed set of utilities, and later the package's own classes too, through the same two routes a project without Tailwind already has: the Vite plugin and `chs build`. It moves from [Roadmap → Possible](./roadmap.md#possible) to Planned by the decisions below, taken by the maintainer on 2026-11-25.

## Decisions

### Which utilities

Layout and spacing (`flex`, `grid`, `gap-*`, alignment, padding, margin), sizing and display (`w-full`, `max-w-*`, `hidden`, `block`, positioning, overflow), and type (size, weight, alignment, line height). That covers most of what a page writes between components.

Left out: colour and border utilities. Colour is what the intent and presentation classes, such as `primary` and `soft`, already own; with both on one page, a `text-red-500` on a `.btn.primary` has no clear owner, and every colour utility would be one more value to keep in step with Tailwind's palette and test.

### Names and values are Tailwind's

A utility the generator writes has Tailwind's name and Tailwind's value: `mt-4` is 1rem here, as in a project that runs Tailwind. The same markup then looks the same on both paths, and a project moves between them without editing a template. A utility whose value cannot be matched exactly is left out rather than approximated.

Rejected: Tailwind's names on the package's own scale, which makes a move between the paths silently change spacing; and names of the package's own, such as `stack-gap-md`, which nobody can bring their Tailwind habits to.

### Variants

The fixed list that the package's axis classes take under `chs build` today, one at a time: `sm`, `md`, `lg`, `xl`, `2xl`, `hover`, `focus`, `focus-visible`, `active`, and `dark`. `md:flex` and `hover:underline` work; `md:hover:underline` does not. No arbitrary values, such as `mt-[13px]`. Past those two limits the generator would be a second Tailwind, and stacking is where the size grows: all 52 of Tailwind's variants measured 197 KB, and the breakpoints stacked on the states another 845 KB ([Build command → No Tailwind utilities, ten variants](./cli.md#no-tailwind-utilities-ten-variants)).

### Delivery

No new command, option, or configuration file. The Vite plugin and `chs build` find utility names the way they find the package's classes, and write their rules into the same stylesheet. A configuration file for look stays [Not Planned](./roadmap.md#not-planned): the generator writes only what the content names, and the same markup renders the same in every project.

### The package's own classes, second

Once the utilities ship, the generator also writes the package's own classes, in place of trimming `dist/purge/index.css`. For the same classes its output is the trimmed stylesheet byte for byte, which a test holds. It retires `dist/purge/` (about 324 KB in every install), and it trims the entrypoints that trimming cannot reach without a second data file: `/components` and `/native`.

## What this reverses

[Build command → No Tailwind utilities, ten variants](./cli.md#no-tailwind-utilities-ten-variants) rejects utilities as a fixed subset of Tailwind compiled in advance, wrong for some project whatever it holds. It did not weigh a step that writes only what the content names, which is this one. The rest of that section, the fixed list of variants and the rejection of all of Tailwind's, stands and is adopted above.

## Not yet decided

Each of these is settled in this document before the code that depends on it.

1. **The exact list of utilities** within the three families, and how each is checked against Tailwind's output for the same class, at which Tailwind versions.
2. **Where a utility sits in the cascade.** `class="btn mt-4"` has to resolve the same way it does in a project that compiles `/tw` with Tailwind, where the order follows Tailwind's sort and the `utilities.families` sublayer of [Cascade layers](./model.md#cascade-layers).
3. **Tailwind changing a value within 4.x.** Whether the generator follows, and in which kind of release.
4. **What the consumer installs.** The generator's code and data replace `dist/purge/`; its size, and the Node.js floor, which stays at 24 unless this record says otherwise.
5. **How the generator is built**, given that [A build the package owns](./roadmap.md#a-build-the-package-owns-with-tailwind-as-an-adapter) already compiles the package's source without Tailwind.
