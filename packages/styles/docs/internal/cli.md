---
status: IMPLEMENTED
last_updated: 2026-11-18
scope: Design decisions, limits, and failure modes of the `chs` build command that ships in `@codenhub/styles`.
---

# Build command

## Purpose

`chs build` lets a project that does not run Tailwind, with a JavaScript build or without one, get a stylesheet trimmed to the classes its templates use, as a bundler's Tailwind plugin gives a Tailwind project. It is the package's one route to a trimmed stylesheet outside Tailwind: the package publishes no compiled file per component family, since one family compiled alone still carries the theme and the shared base and is about 31 KB minified for the buttons, where the command writes about 29 KB for a page with one button. It is deliberately thin: one `build` command that tree-shakes a stylesheet this package compiled, improved as real consumers need more. The source is `src/cli/`, bundled to `dist/cli.js` by `pnpm build:cli`, the last step of `pnpm build`; the tests are `tests/integration/cli.test.ts` and `tests/integration/purge.test.ts`. Public usage is in [Without a bundler](../integrating/without-a-bundler.md#build-only-the-classes-you-use).

## One package

The command ships inside `@codenhub/styles` as its `bin`, named `chs`, so a consumer runs it from a `package.json` script as `chs build …`, or as `npx @codenhub/styles build …`, which runs the package's only `bin`.

The public documentation never shows `npx chs`. An unrelated package named `chs` exists on npm, and `npx chs` runs it wherever this package is not installed. Checked against a packed tarball under npm 11.12 on Windows 11: with the package installed, both the script form and `npx @codenhub/styles build` build, and `npx @codenhub/styles --version` prints this package's version.

Rejected: an alias under the earlier `bin` name, `codenhub-styles`. The rename is a breaking change of a 0.x package, which the changelog records, and an alias would be a second name to document and remove later.

Rejected: a separate `@codenhub/styles-cli` package. A second package is only harder to use: a second name to find and install, a second version that has to be matched to the StyleKit version it builds, and a release order to get right, since the CLI cannot be published until the StyleKit release it depends on is out.

## The command tree-shakes; it does not compile

The command compiles nothing. `scripts/build-purge.mjs` runs Tailwind at this package's build and writes `dist/purge/`:

- `index.css`: the complete stylesheet, as `dist/index.css`, plus each intent, presentation, and modifier class under each of ten variants, such as `md:lg` and `hover:primary`.
- `classes.json`: the class names the command may drop.

`src/cli/purge.ts` parses `index.css` and drops each rule whose selectors cannot match the classes found in the content. Any other class in the stylesheet is one Tailwind always emits, such as `.theme-dark`, which a script adds at run time and no template names, so the command keeps it. Purged to every class, the output is `dist/index.css` byte for byte, which `tests/integration/purge.test.ts` holds.

Rejected: running Tailwind in the consumer's project, loading the `@tailwindcss/cli` and `tailwindcss` the consumer installs as optional peers, compiling `/tw` against their templates, and writing what Tailwind writes. It loses for three reasons:

- **It makes the consumer install Tailwind.** Two peers, `@tailwindcss/cli` and `tailwindcss`, kept within `>=4.3.2 <5`, for a consumer who otherwise has no JavaScript build at all; `npx @codenhub/styles build` in an empty folder cannot work, since no package manager installs an optional peer.
- **Its output varies with the consumer's Tailwind.** The same templates and the same StyleKit version can write a different stylesheet under a different 4.x patch, which this package can neither test nor pin.
- **It calls API Tailwind does not document.** To turn off the polyfills the CLI always writes, the command has to call `compile`, `Scanner`, and `optimize` from `@tailwindcss/node` and `@tailwindcss/oxide` in its own process, the API Tailwind's own integrations use but its documentation does not promise.

The command imports nothing beyond Node.js built-ins, which `tests/integration/cli.test.ts` checks of the bundle, and its output depends only on the package version and the content.

Cost accepted: every consumer installs `dist/purge/`, about 305 KB (25 KB gzipped) for `index.css` and 7 KB for `classes.json`, whether or not they run the command. That is far less than the 19 MB that `@tailwindcss/cli` and `tailwindcss` as regular `dependencies` would cost every consumer to make the bare `npx` work, which is rejected for that size.

Rejected: a fork of Tailwind's compiler or scanner inside the package. It would make this package maintain a CSS compiler to keep Tailwind's output, utilities included, for consumers who can run Tailwind themselves through `/tw`. Since 0.10.0, [a build of this package's own](./roadmap.md#a-build-the-package-owns-with-tailwind-as-an-adapter) compiles its source, and Tailwind is the `/tw` integration and the compiler of the variants in `dist/purge/`, and nothing else. That build is not the fork rejected here: it compiles this package's source and no Tailwind utility.

## No Tailwind utilities, ten variants

The command emits StyleKit classes only. A Tailwind utility such as `flex` or `mt-4` is not in `dist/purge/index.css`, so it is never found. Shipping utilities would mean shipping a fixed subset of Tailwind compiled in advance, and any subset is the wrong one for some project; a project that wants them runs Tailwind and imports `/tw`, which gives every utility and every variant. [Roadmap → Possible](./roadmap.md#possible) keeps open a command that generates a closed set of utilities instead of trimming a compiled one; this decision stands until that one is made.

The variants are a fixed list in `scripts/build-purge.mjs`: `sm`, `md`, `lg`, `xl`, `2xl`, `hover`, `focus`, `focus-visible`, `active`, and `dark`, on the intent, presentation (fill and edge), and modifier classes from `registry.json`, except `disabled`, which the documentation tells consumers to write as the attribute or the class. Each variant costs its copy of every class it applies to, about 3 KB minified for the axis classes alone, and a page pays only for the ones it uses, but every install carries them all.

Rejected: all of Tailwind's variants. 52 of them measured 197 KB in the source, and stacking the breakpoints on the states another 845 KB, for combinations few pages use. Rejected too: component classes, such as `btn` or `card`, under a variant; a component switched on at a breakpoint is better written as two elements or a layout helper, and doubling the components would double the source.

## Which classes the command may drop

A class may be dropped when it is a Tailwind candidate: naming it adds CSS to the build. `scripts/build-purge.mjs` finds them by adding each class of `dist/index.css` to a compiler one at a time and comparing the output's length, since the compiler keeps every candidate it was given. Reading them from the selectors of an empty build was rejected: those name component classes inside rules Tailwind always emits.

## Node.js version

The command supports Node.js 26 and newer, the version this repository builds and tests with. The package declares `engines.node` as `>=26`, as `docs/specs/packages-lifecycle.md` requires of a package with a CLI, so a consumer on an older Node.js is warned on install by npm, stopped by Yarn 1 and by npm with `engine-strict`, and told nothing by pnpm 11, even when they only link the CSS; on Node.js 22, `yarn add` fails with "The engine \"node\" is incompatible with this module". The floor is the pinned major, not the oldest release the code runs on: the newest API the command uses is `globSync` from `node:fs`, which Node.js 22 has. The floor follows the pinned major, as that specification asks of a package's next breaking release, because a floor on the previous line is tested only while the `floor` job of `docs/ci.md` lasts. The command also checks the version itself when `build` runs and names both versions. The inlined scanner takes `globSync` from the default export of `node:fs` so that an older Node.js reaches that check: a named import of a missing export fails at load, before any code runs.

## Finding the package root

The command resolves everything from this package's own files, never through its package name: a package resolving itself by name depends on self-reference and on how it was installed. The running file is `src/cli/run.ts` in the tests and `dist/cli.js` once built, two different depths below the package root, so `findPackageRoot` walks up from the running file to the nearest folder holding a `package.json`. No folder between either file and the root holds one. `tests/integration/cli.test.ts` covers the walk, and its `--version` test checks the root it finds in practice is this package's.

The aesthetic names are read from the keys of the same manifest's `exports` (`./aesthetics/<name>`, less `./aesthetics/tw`, which is the Tailwind source of all of them), and each `--aesthetic` reads the file that subpath names under the `import` condition, so a new aesthetic needs no change to the command. An aesthetic is added only when asked for, since no template names which one a project wants, and is purged against the same classes as the stylesheet: its solo class is not in `classes.json`, so it is kept, and its rules for unused components are dropped.

## How classes are found

Content is read as text and never run, as Tailwind reads it. Every run of characters a class name can hold is a word, and a word counts when it is in `classes.json`. A word that is not one is read again by its parts around each colon, so Svelte's `class:primary={isPrimary}` and a Ruby `btn: true` are found. Only the `--content` globs are read: nothing of the consumer's other files or of this package adds a class, and nothing is written but the output. The output file is left out even when a glob matches it: it names every class the last build kept, so read back it would keep them, and the stylesheet would grow with each build instead of following the templates. Files are read one at a time and each is dropped once its classes are counted, so memory follows the largest file, not the sum of them. The tests hold it: a class only in an unlisted file in the working directory stays out, and a build whose glob matches its output writes the same stylesheet twice.

Resolving the globs, reading the files, and splitting them into words are done by `@codenhub/scan`, a private package this package and `@codenhub/icons` inline; which words count stays here. A `--content` entry is tried as a literal path before it is read as a glob, so `app/[id]/page.tsx` is found, where `fs.glob` alone reads `[id]` as a set of letters and matches nothing. A glob that matches a link to a file reads the file, as `scanFiles` in `@codenhub/icons` does. The icons [Build command](../../../icons/docs/internal/cli.md#the-shared-scanner) records the split.

## Content globs that match nothing

Each `--content` entry has to name at least one file, and each file it names has to be readable; the scanner fails on either, in the strict modes this command turns on. A build from no content would write a stylesheet without component classes, which on a deploy is a site that silently loses its styling.

## Replacing the output

The stylesheet is written to a temporary file beside the output, `<output>.<pid>.tmp`, and renamed over it, so a write that fails partway, on a full disk say, leaves the previous stylesheet whole rather than a truncated one a deploy would ship. A rename puts a new file in place, so on POSIX the temporary file first takes the permission bits, owner, and group of the file it replaces: a `0640` stylesheet of the web server's group used to come back `0644` and the runner's, readable by everyone and perhaps no longer by the server. `tests/integration/cli.test.ts` holds the mode on every POSIX run, the owner as root, and the group where the runner is in a second group.

Only root can give a file to another user, and a user can give a file only to a group they are in. A runner without that right does not fail a build that wrote the stylesheet, since the output itself is right: it keeps the group when it can, keeps the mode, and prints one `chs: warning:` line to stderr naming the owner, and the group when that changed too, before the usual line on stdout, and exits with status 0. Any other failure to set the owner, group, or mode fails the build as a failed write. The warning has no test, since a test cannot make a file of another user without root; it was checked under WSL Arch with Node.js 26.13.1 on 2026-11-19, as a user replacing a root-owned stylesheet in a folder that user owns, once with the group kept and once without.

Windows keeps neither, and needs neither kept: a new file takes its folder's permissions, and the only mode Node.js reads there is the read-only attribute. Windows refuses to rename over a read-only file, so a read-only `--output` fails as a write the user may not make, with `EPERM`, after the brief retries the rename gets on Windows for a file another process holds open; `tests/integration/cli.test.ts` holds it. POSIX replaces a read-only file, since the rename needs only the folder's permission, and keeps it read-only. Rejected: clearing the attribute to replace the file and setting it again, which would change a file the user marked read-only before knowing the write succeeds.

## Limits

- **Classes are found as words.** A class assembled at render time, such as `class="btn <%= kind %>"`, is never found. The public page documents the two workarounds: write class names whole in a file the build reads, or list them in a safelist file passed as another `--content`.
- **No Tailwind utilities, no other variants, no stacked variants.** As [No Tailwind utilities, ten variants](#no-tailwind-utilities-ten-variants) records. A consumer who needs them has outgrown the command and imports `@codenhub/styles/tw` from their own Tailwind input.
- **No watch mode or other commands.** They are left out until a consumer needs them.
- **No configuration file or custom CSS input.** A project changes the look with tokens and container classes, and resizes controls with `--ui-scale`; [Roadmap → Not Planned](./roadmap.md#not-planned) records why a configuration file was dropped.
- **Node.js 26 or newer.** The floor is the major this repository pins, and the command checks the version itself before it reads a file, as [Node.js version](#nodejs-version) describes. The stylesheets themselves need no Node.js.

## Failure modes

Every failure the command handles prints one line, `chs: <reason>`, to stderr and exits with status 1 without writing the output file. `tests/integration/cli.test.ts` runs the command into most of the reasons below. Three it does not: a content file that cannot be read, which `@codenhub/scan`'s own tests cover where its `readFiles` reports it; a flag given a value it does not take; and an existing `--output` the command cannot read. The links are tested only where the system lets the test create one, so not on a Windows account without developer mode. The reasons: a missing `--content` or `--output` (an `--output` of only spaces counts as missing); a `--content` glob that matches no file, naming the glob and the folder; an extra positional argument, almost always an unquoted glob the shell expanded; an unknown flag, or a flag missing its value or given one it does not take, worded from `parseArgs`'s error rather than passed through, since Node words those for programmers; an unknown aesthetic, listing the valid ones; a missing or unknown command; a Node.js older than 26, naming both versions; an `--output` of `-`, which Tailwind's CLI reads as standard output and this command would write as a file named `-`; an `--output` that a `--content` entry names, or an existing file that holds more than whitespace and does not start, within its first 1,024 bytes, with the package's `/*! @codenhub/styles` notice, optionally after Tailwind's banner, which the command did not write and would replace whole, so a template or a hand-written stylesheet named by mistake is kept; an existing `--output` it cannot read, since a folder can allow a file to be renamed over without allowing it to be read; an `--output` that is, after any link, a folder, a device, a pipe, or a socket, named by kind, since the rename that replaces the output would replace a pipe with a file, and as root a device too, so `-o /dev/null` turned `/dev/null` into a stylesheet, and a folder failed with a raw `EISDIR`, or `EPERM` on Windows. Every stylesheet the command has written since 0.9.0 starts with that notice, and so does each compiled stylesheet, so a copy of one is replaced. Rejected: taking any `/*!` banner or `@layer` at the head as a stylesheet built to be replaced, which 0.11.0 did before its release, because a stylesheet written by hand opens with a layer order as often as not, as the essential-motion example in the accessibility page does, and a vendor's opens with its own banner, and nothing the command writes needs either. An `--output` that is a link is written through: the file it leads to is replaced and the link stays, and a content file that leads to the output is not read; a file that cannot be read, with Node.js's own message, or with its path added when Node.js leaves it out, as for a file too large for a string; and a failed write, naming the `--output` as given, with Node.js's reason and code and what to do, a read-only `--output` on Windows among them, as [Replacing the output](#replacing-the-output) records. The write goes to a temporary file beside the output that is then renamed over it, and Node.js's message names whichever path its call failed on, mostly that temporary file, which the user never gave; so the paths are dropped from the message, and `--output` is named instead.
