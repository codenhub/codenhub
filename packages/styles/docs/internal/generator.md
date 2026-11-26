---
status: APPROVED
last_updated: 2026-11-26
scope: Decisions on a build step that writes, rather than trims, the rules a project's files use.
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

## The list, and how it is checked

Tailwind 4 accepts any spacing number, so `mt-13` compiles there; the generator writes a closed list the package chooses, kept in one file:

- **Keywords** from [Which utilities](#which-utilities), each with Tailwind's names: display (`block`, `inline-block`, `inline`, `flex`, `inline-flex`, `grid`, `hidden`), flex and grid layout (`flex-row`, `flex-col`, `flex-wrap`, `flex-1`, `grow`, `shrink-0`, `grid-cols-1` to `grid-cols-12`, `col-span-1` to `col-span-12`), alignment (`items-*`, `justify-*`, `self-*`, `place-*`, `content-*`), sizing (`w-full`, `w-auto`, `w-screen`, `h-full`, `h-auto`, `h-screen`, `min-w-0`, `min-h-screen`), position (`static`, `relative`, `absolute`, `fixed`, `sticky`), overflow (`overflow-*`, `overflow-x-*`, `overflow-y-*`), and text alignment (`text-left`, `text-center`, `text-right`, `text-justify`).
- **Spacing** (padding, margin, gap, the position offsets `inset-*`, `top-*`, `right-*`, `bottom-*`, and `left-*`, and the sizing utilities that take a spacing value): the steps 0 to 12, then 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, and 96, plus `px` and the halves 0.5, 1.5, 2.5, and 3.5 as Tailwind writes them.
- **Type and width** by Tailwind's theme keys: `text-*`, `font-*`, `leading-*`, `tracking-*`, `max-w-*` for each container size, and `underline` and `no-underline`, which the type family takes so that `hover:underline` works.
- **Left out:** a utility that sets a `--tw-*` property other than the nine `tw/theme.css` registers ([Cascade layers](./model.md#cascade-layers)), such as `space-x-*`, since the generator would have to ship its registration too.

A test compiles each class, plain and under each of the ten variants, with Tailwind, and compares the declarations with the generator's. It loads the compiler through `@tailwindcss/cli`, as `tests/browser/tw-consumer.spec.ts` does, not through `@tailwindcss/node`, which pins its own `tailwindcss` exactly and so never runs the release the Tailwind workflow installs.

### No decimals or fractions in the first release

Classes are found as words of letters, digits, `:`, and `-` (`src/trim/classes.ts`), so `px-1.5` and `w-1/2` would never be found, and the halves above are written only once the scan finds them. They are left out of the release that first ships the generator: adding them later breaks no page, while widening the word set changes what the scan keeps for the package's own classes too. Rejected: widening it in the same release, which puts a change to every project's trimmed stylesheet behind a feature most of them do not use.

## Where a utility sits in the cascade

The generated rules go in the `utilities` layer, never `utilities.families`, so they keep beating the family classes, and are merged into the trimmed layer in Tailwind's order: variants, then property order, then property count, then name, the sort `scripts/lib/sort.mjs` already copies from Tailwind 4.3.4. `class="btn mt-4"` then resolves as it does in a project that compiles `/tw`, where a component that sorts later and sets the same property wins. The sort moves into `src/` so the package's build and the generator share one copy, and the build ships a sort key for each rule of the package's utilities layer, about 5 to 10 KB. A test compiles `/tw` and a mixed page, such as `btn mt-4`, `md:flex`, and `md:primary`, with Tailwind, and holds the order `chs build` writes to it, as `adapter.test.ts` holds the compiled entries.

Rejected: appending the generated rules after the package's, which is cheaper but makes a utility always beat a component of equal specificity, so the same markup would render differently on the two paths.

## Tailwind changing a value

The values are frozen to `TAILWIND_VERSION` in `scripts/lib/compile.mjs`, the release `src/base/` is copied from. The step that extracts them fails when the installed Tailwind is another release, so moving the catalog's Tailwind is one change that copies `src/base/` again and takes the new values on purpose. A changed value changes what a page renders, so it ships in a minor release, as [Roadmap → Versioning](./roadmap.md#versioning) asks. Rejected: following in patches, which a patch may not do; and never following, which lets the two paths drift apart, the thing [Names and values are Tailwind's](#names-and-values-are-tailwinds) rules out.

## What the consumer installs

A JSON table under `dist/`, read through `readPackageFile` as `classes.json` is, so it is not copied into both `cli.js` and `vite.js`: each class's body and sort key, the theme values it reads, and the ten variant wrappers and their order. Estimated, by compiling a draft of the list with Tailwind 4.3.4 in memory, at about 110 to 130 KB, 15 KB gzipped, with 8 to 15 KB of code in each bundle. The variants are applied when the generator runs: every class compiled ahead under all ten measured 1,366,411 bytes, the size [Build command → No Tailwind utilities, ten variants](./cli.md#no-tailwind-utilities-ten-variants) already rejected. `dist/purge/` stays until [the package's own classes](#the-packages-own-classes-second) are generated too, so the first release grows each install by about 130 KB. The work is string handling and JSON, so the Node.js floor stays at 24.

## How it is built

The package's own build already compiles its source without Tailwind (since 0.10.0), and `scripts/build-purge.mjs` still runs `@tailwindcss/node` when the package is built. A step beside it compiles the list once with the catalog's Tailwind and writes the table above. Rejected: a table typed by hand, which repeats Tailwind's values and drifts from them unseen.
