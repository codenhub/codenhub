---
status: IMPLEMENTED
last_updated: 2026-11-12
scope: Design decisions, limits, and failure modes of the `chs` build command that ships in `@codenhub/styles`.
---

# Build command

## Purpose

`chs build` lets a project that does not run Tailwind, with a JavaScript build or without one, get a stylesheet trimmed to the classes its templates use, as a bundler's Tailwind plugin gives a Tailwind project. It is the package's one route to a trimmed stylesheet outside Tailwind: the package publishes no compiled file per component family, since one family compiled alone still carries the theme and the shared base and is about 31 KB minified for the buttons, where the command writes about 24 KB for a page with one button. It is deliberately thin: one `build` command that tree-shakes a stylesheet this package compiled, improved as real consumers need more. The source is `src/cli/`, bundled to `dist/cli.js` by `pnpm build:cli`, the last step of `pnpm build`; the tests are `tests/integration/cli.test.ts` and `tests/integration/purge.test.ts`. Public usage is in [Without a bundler](../integrating/without-a-bundler.md#build-only-the-classes-you-use).

## One package

The command ships inside `@codenhub/styles` as its `bin`, named `chs`, so a consumer runs it from a `package.json` script as `chs build …`, or as `npx @codenhub/styles build …`, which runs the package's only `bin`.

The public documentation never shows `npx chs`. An unrelated package named `chs` exists on npm, and `npx chs` runs it wherever this package is not installed. Checked on 2026-11-12 against a packed tarball under npm 11.12 on Windows 11: with the package installed, both the script form and `npx @codenhub/styles build` build, and `npx @codenhub/styles --version` prints this package's version.

Rejected: an alias for the old name, `codenhub-styles`. The rename is a breaking change of a 0.x package, recorded in the 0.9.0 changelog, and an alias would be a second name to document and remove later.

Rejected: a separate `@codenhub/styles-cli` package. It was built first, on the branch that added the command, and never published. A second package was only harder to use: a second name to find and install, a second version that had to be matched to the StyleKit version it built, and a release order to get right, since the CLI could not be published until the StyleKit release it depended on was out.

## The command tree-shakes; it does not compile

In 0.8.0, its first release, the command ran Tailwind in the consumer's project: it loaded the `@tailwindcss/cli` and `tailwindcss` the consumer had installed as optional peers, compiled `/tw` against their templates, and wrote what Tailwind wrote. In 0.9.0 it compiles nothing. `scripts/build-purge.mjs` runs Tailwind at this package's build and writes `dist/purge/`:

- `index.css`: the complete stylesheet, as `dist/index.css`, plus each intent, presentation, and modifier class under each of ten variants, such as `md:lg` and `hover:primary`.
- `classes.json`: the class names the command may drop.

`src/cli/purge.ts` parses `index.css` and drops each rule whose selectors cannot match the classes found in the content. Any other class in the stylesheet is one Tailwind always emits, such as `.theme-dark`, which a script adds at run time and no template names, so the command keeps it. Purged to every class, the output is `dist/index.css` byte for byte, which `tests/integration/purge.test.ts` holds.

The Tailwind build was replaced for three reasons:

- **It made the consumer install Tailwind.** Two peers, `@tailwindcss/cli` and `tailwindcss`, kept within `>=4.3.2 <5`, for a consumer who otherwise has no JavaScript build at all; `npx @codenhub/styles build` in an empty folder could not work, since no package manager installs an optional peer.
- **Its output varied with the consumer's Tailwind.** The same templates and the same StyleKit version could write a different stylesheet under a different 4.x patch, which this package could neither test nor pin.
- **It called API Tailwind does not document.** To turn off the polyfills the CLI always writes, the command called `compile`, `Scanner`, and `optimize` from `@tailwindcss/node` and `@tailwindcss/oxide` in its own process, the API Tailwind's own integrations use but its documentation does not promise.

Now the command imports nothing beyond Node.js built-ins, which `tests/integration/cli.test.ts` checks of the bundle, and its output depends only on the package version and the content.

Cost accepted: every consumer installs `dist/purge/`, about 273 KB (22 KB gzipped) for `index.css` and 7 KB for `classes.json`, whether or not they run the command. That is far less than the 19 MB that `@tailwindcss/cli` and `tailwindcss` as regular `dependencies` cost every consumer, which made the bare `npx` work and was reverted before 0.8.0 for that size.

Rejected: a fork of Tailwind's compiler or scanner inside the package. It would make this package maintain a CSS compiler to keep the old output, utilities included, for consumers who can run Tailwind themselves through `/tw`. Tailwind stays the authoring tool and the `/tw` integration, and nothing else.

## No Tailwind utilities, ten variants

The command emits StyleKit classes only. A Tailwind utility such as `flex` or `mt-4` is not in `dist/purge/index.css`, so it is never found. Shipping utilities would mean shipping a fixed subset of Tailwind compiled in advance, and any subset is the wrong one for some project; a project that wants them runs Tailwind and imports `/tw`, which gives every utility and every variant.

The variants are a fixed list in `scripts/build-purge.mjs`: `sm`, `md`, `lg`, `xl`, `2xl`, `hover`, `focus`, `focus-visible`, `active`, and `dark`, on the intent, presentation (fill and edge), and modifier classes from `registry.json`, except `disabled`, which the documentation tells consumers to write as the attribute or the class. Each variant costs its copy of every class it applies to, about 3 KB minified for the axis classes alone, and a page pays only for the ones it uses, but every install carries them all.

Rejected: all of Tailwind's variants. 52 of them measured 197 KB in the source, and stacking the breakpoints on the states another 845 KB, for combinations few pages use. Rejected too: component classes, such as `btn` or `card`, under a variant; a component switched on at a breakpoint is better written as two elements or a layout helper, and doubling the components would double the source.

## Which classes the command may drop

A class may be dropped when it is a Tailwind candidate: naming it adds CSS to the build. `scripts/build-purge.mjs` finds them by adding each class of `dist/index.css` to a compiler one at a time and comparing the output's length, since the compiler keeps every candidate it was given. Reading them from the selectors of an empty build was rejected: those name component classes inside rules Tailwind always emits.

## Node.js version

The command supports Node.js 24 and newer, the version this repository builds and tests with; it uses `glob` from `node:fs/promises`, which older releases lack or mark experimental. The package declares `engines.node` as `>=24`, as `docs/specs/packages-lifecycle.md` requires of a package with a CLI, so a consumer on an older Node.js is warned on install by npm, stopped by Yarn 1 and by npm with `engine-strict`, and told nothing by pnpm 11, even when they only link the CSS; on Node.js 22, `yarn add` fails with "The engine \"node\" is incompatible with this module". The floor stays the pinned major regardless, because a lower one would name a line CI does not test. The command also checks the version itself when `build` runs and names both versions. `node:fs/promises` is imported as a namespace so that an older Node.js reaches that check: a named import of a missing export fails at load, before any code runs.

## Finding the package root

The command resolves everything from this package's own files, never through its package name: a package resolving itself by name depends on self-reference and on how it was installed. The running file is `src/cli/run.ts` in the tests and `dist/cli.js` once built, two different depths below the package root, so `findPackageRoot` walks up from the running file to the nearest folder holding a `package.json`. No folder between either file and the root holds one. `tests/integration/cli.test.ts` covers the walk, and its `--version` test checks the root it finds in practice is this package's.

The aesthetic names are read from the keys of the same manifest's `exports` (`./aesthetics/<name>`), and each `--aesthetic` reads the file that subpath names under the `import` condition, so a new aesthetic needs no change to the command. An aesthetic is added only when asked for, since no template names which one a project wants, and is purged against the same classes as the stylesheet: its solo class is not in `classes.json`, so it is kept, and its rules for unused components are dropped.

## How classes are found

Content is read as text and never run, as Tailwind reads it. Every run of characters a class name can hold is a word, and a word counts when it is in `classes.json`. A word that is not one is read again by its parts around each colon, so Svelte's `class:primary={isPrimary}` and a Ruby `btn: true` are found. Only the `--content` globs are read: nothing of the consumer's other files or of this package adds a class, and nothing is written but the output. The tests hold it: a class only in an unlisted file in the working directory stays out.

## Content globs that match nothing

Each `--content` glob is checked with `fs.glob` and has to match at least one file. A build from no content would write a stylesheet without component classes, which on a deploy is a site that silently loses its styling.

## Limits

- **Classes are found as words.** A class assembled at render time, such as `class="btn <%= kind %>"`, is never found. The public page documents the two workarounds: write class names whole in a file the build reads, or list them in a safelist file passed as another `--content`.
- **No Tailwind utilities, no other variants, no stacked variants.** As [No Tailwind utilities, ten variants](#no-tailwind-utilities-ten-variants) records. A consumer who needs them has outgrown the command and imports `@codenhub/styles/tw` from their own Tailwind input.
- **No watch mode or other commands.** They are left out until a consumer needs them.
- **No configuration file or custom CSS input.** A project changes the look with tokens and container classes, and resizes controls with `--ui-scale`; [Roadmap → Not Planned](./roadmap.md#not-planned) records why a configuration file was dropped.
- **Node.js 24 or newer.** The command uses `glob` from `node:fs/promises`, and checks the version itself before using it, as [Node.js version](#nodejs-version) describes. The stylesheets themselves need no Node.js.

## Failure modes

Every failure the command handles prints one line, `chs: <reason>`, to stderr and exits with status 1 without writing the output file. The reasons, each tested: a missing `--content` or `--output` (an `--output` of only spaces counts as missing); a `--content` glob that matches no file, naming the glob and the folder; an extra positional argument, almost always an unquoted glob the shell expanded; an unknown flag, or a flag missing its value or given one it does not take, worded from `parseArgs`'s error rather than passed through, since Node words those for programmers; an unknown aesthetic, listing the valid ones; a missing or unknown command; a Node.js older than 24, naming both versions; and a failed write, with Node.js's own message, such as `EISDIR` when `--output` names a folder, or `EPERM` for the same mistake on Windows.
