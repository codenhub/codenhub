---
status: IMPLEMENTED
last_updated: 2026-11-10
scope: Design decisions, limits, and failure modes of the `codenhub-styles` build command that ships in `@codenhub/styles`.
---

# Build command

## Purpose

`codenhub-styles build` lets a project that does not run Tailwind, with a JavaScript build or without one, get the tree-shaken stylesheet that a bundler's Tailwind plugin gives a Tailwind project, without wiring up Tailwind's CLI itself. It is the package's one route to a trimmed stylesheet outside Tailwind: the package publishes no compiled file per component family, since one family compiled alone still carries the theme and the shared base and is about 31 KB minified for the buttons, where the command writes about 26 KB for a page with one button. It is deliberately thin: one `build` command over the Tailwind compiler that `@tailwindcss/cli` installs, improved as real consumers need more. The source is `src/cli/`, bundled to `dist/cli.js` by `pnpm build:cli`, the last step of `pnpm build`; the tests are `tests/integration/cli.test.ts`. Public usage is in [Without a bundler](../integrating/without-a-bundler.md#build-only-the-classes-you-use).

## One package

The command ships inside `@codenhub/styles` as its `bin`, so the user-facing command is `npx codenhub-styles build …` once the package is installed.

Rejected: a separate `@codenhub/styles-cli` package. It was built first, on the branch that added the command, and never published. A second package was only harder to use: a second name to find and install, a second version that had to be matched to the StyleKit version it built, and a release order to get right, since the CLI could not be published until the StyleKit release it depended on was out.

## Tailwind is an optional peer

`@tailwindcss/cli` and `tailwindcss` are optional peer dependencies (`>=4.3.2 <5`), not dependencies. A consumer who links the compiled `dist/` files, or imports `/tw` into a bundler that already has Tailwind, installs nothing for the command and gets no peer warning; what the command adds to their install is `dist/cli.js`, about 8 KB with no imports beyond Node.js built-ins.

The command resolves both packages when `build` runs, from its own file, which is where `tw/` resolves its `@import "tailwindcss"` from. When either is missing it stops before writing anything and prints one line naming the missing ones and the `npm install --save-dev …` that adds them. `tailwindcss` is checked as well as `@tailwindcss/cli`, although the CLI depends on it: whether that copy is visible from `tw/` depends on the package manager's layout. Only `MODULE_NOT_FOUND` counts as missing; any other resolution error is passed on. `tests/integration/cli.test.ts` covers each case.

Checked against a packed tarball on Windows 11: npm 11.12 with the package alone installs no Tailwind and gets the message; with both peers it builds; pnpm 11.7 the same.

Cost accepted: `npx @codenhub/styles build …` in a folder with nothing installed does not work, because no package manager installs an optional peer. The no-bundler consumer runs one install first, which also gives them a lockfile to pin the build with.

Rejected: `@tailwindcss/cli` and `tailwindcss` as regular `dependencies`, which was built and reverted before release. It made the bare `npx` command work, at about 19 MB installed for every consumer, including the ones who never run the command, and it made `tailwindcss` this package's own dependency instead of the consumer's, so under pnpm a `/tw` consumer could compile against a different patch release than their compiler.

## Node.js version

The command supports Node.js 24 and newer, the version this repository builds and tests with; it uses `glob` from `node:fs/promises`, which older releases lack or mark experimental. The package declares `engines.node` as `>=24`, as `docs/specs/packages-lifecycle.md` requires of a package with a CLI, so a consumer on an older Node.js sees an engine warning on install even when they only link the CSS. The command also checks the version itself when `build` runs and names both versions. `node:fs/promises` is imported as a namespace so that an older Node.js reaches that check: a named import of a missing export fails at load, before any code runs.

## Finding the package root

The command resolves everything from this package's own files, never through its package name: a package resolving itself by name depends on self-reference and on how it was installed. The running file is `src/cli/run.ts` in the tests and `dist/cli.js` once built, two different depths below the package root, so `findPackageRoot` walks up from the running file to the nearest folder holding a `package.json`. No folder between either file and the root holds one. `tests/integration/cli.test.ts` covers the walk, and its `--version` test checks the root it finds in practice is this package's.

## How StyleKit and Tailwind are reached

- StyleKit entries are resolved through the `exports` map of this package's own `package.json`, by the target each subpath names under the `import` condition. Every StyleKit export names the same file under `style` and `import`, so the result is the file a CSS bundler would pick.
- The aesthetic names are read from the keys of the same `exports` (`./tw/aesthetics/<name>`), so a new aesthetic needs no change to the command.
- Tailwind's compiler is loaded in the command's own process, `compile` and `optimize` from `@tailwindcss/node` and `Scanner` from `@tailwindcss/oxide`, each required from the folder `@tailwindcss/cli` is installed in. The CLI depends on both at its own exact version, so they resolve from it under npm's and pnpm's layouts alike, and the consumer installs nothing beyond the two peers. The command calls what the CLI calls: `compile` with the generated input, a `Scanner` over the sources it returns, and `optimize` with `minify` when minifying.

## Tailwind's polyfills are off

From 4.3.3 Tailwind follows every `color-mix()` that reads a `var()` with a fallback for browsers without `color-mix()`, and every registered property with one for browsers without `@property`. Every browser StyleKit supports has both, so those fallbacks never apply. The command compiles with `polyfills` set to none, as `scripts/build-styles.mjs` does for `dist/`: a page with one button drops from 28,280 to 25,782 bytes minified, and a page with twelve classes from 64,944 to 56,094 bytes, about a tenth gzipped. `tests/integration/cli.test.ts` fails if a fallback comes back.

Rejected: running Tailwind's CLI as a child process, which the command did first. The CLI has no flag for polyfills, so it always wrote the fallbacks. Tailwind's discussion [#20701](https://github.com/tailwindlabs/tailwindcss/discussions/20701) asks for one. Rejected too: `@tailwindcss/node` as a third optional peer, which would give the consumer a third package to install and keep at the CLI's version, for modules the CLI already brings.

Cost accepted: `compile`, `Scanner`, and `optimize` are the API Tailwind's own integrations use, not one its documentation promises, so a later 4.x could change them. The tests run the command against the workspace's Tailwind on every change, and a packed tarball was checked against Tailwind 4.3.2, the floor of the peer range, under npm 11.12 and pnpm 11.7 on Windows 11, on 2026-11-11.

## How the build is isolated

Only the consumer's `@source` globs are scanned. The command passes the scanner the sources `compile` returns and adds no automatic source detection, so nothing of the consumer's other files, of this package, or of the generated input adds a class to the output, and nothing is written but the output. The tests hold it: a class only in an unlisted file in the working directory stays out.

## Paths in the generated input

`@source` takes an absolute glob resolved against the directory the command runs in, written with forward slashes: a CSS string reads a backslash as an escape, and Tailwind 4.3.4 accepts a forward-slash absolute path on Windows (checked on Windows 11 with `C:/...` globs). `@import` uses a `file:` URL, the same form `tests/browser/tw-consumer.spec.ts` uses.

## Content globs that match nothing

Each `--content` glob is checked with `fs.glob` before Tailwind runs and has to match at least one file. Tailwind itself treats an empty source as success and writes a stylesheet without component classes, which on a deploy is a site that silently loses its styling.

## Limits

- **Classes are found as words.** The build reads content as text, as Tailwind does, so a class assembled at render time, such as `class="btn <%= kind %>"`, is never found. The public page documents the two workarounds: write class names whole in a file the build reads, or list them in a safelist file passed as another `--content`.
- **No watch mode, configuration file, custom CSS input, or other commands.** They are left out until a consumer needs them. A consumer who needs Tailwind configuration has outgrown the command and can import `@codenhub/styles/tw` from their own Tailwind input.
- **No Tailwind version of its own.** Each build uses the `@tailwindcss/cli` and `tailwindcss` the consumer installed, within the `>=4.3.2 <5` peer range; their lockfile pins them.
- **Node.js 24 or newer.** The command uses `glob` from `node:fs/promises`, and checks the version itself before using it, as [Node.js version](#nodejs-version) describes. The package declares `engines.node` as `>=24`; the stylesheets themselves need no Node.js.

## Failure modes

Every failure the command handles prints one line, `codenhub-styles: <reason>`, to stderr and exits with status 1 without writing the output file. The reasons, each tested: a missing `--content` or `--output` (an `--output` of only spaces counts as missing); a `--content` glob that matches no file, naming the glob and the folder; an extra positional argument, almost always an unquoted glob the shell expanded; an unknown flag, or a flag missing its value or given one it does not take, worded from `parseArgs`'s error rather than passed through, since Node words those for programmers; an unknown aesthetic, listing the valid ones; a missing or unknown command; and a failed compile or write, with Tailwind's or Node.js's own message, such as `EISDIR` when `--output` names a folder.
