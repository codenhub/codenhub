---
status: IMPLEMENTED
last_updated: 2026-11-10
scope: Design decisions, limits, and failure modes of the `codenhub-styles` build command that ships in `@codenhub/styles`.
---

# Build command

## Purpose

`codenhub-styles build` lets a project without a JavaScript build get the tree-shaken stylesheet that a bundler's Tailwind plugin gives a JavaScript project, without wiring up Tailwind's CLI itself. It is deliberately thin: one `build` command over Tailwind's own CLI, improved as real consumers need more. The source is `src/cli/`, bundled to `dist/cli.js` by `pnpm build:cli`, the last step of `pnpm build`; the tests are `tests/integration/cli.test.ts`. Public usage is in [Without a bundler](../integrating/without-a-bundler.md#build-only-the-classes-you-use).

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
- Tailwind's CLI is run through the `bin` its `package.json` declares, with `process.execPath`, so no shell and no `PATH` lookup is involved. Its stderr is reduced to the first `Error: ...` line, because Tailwind prints a handled error inside a drawn box and a crash as a Node.js stack trace.

## How the build is isolated

Each run writes a generated `input.css` into a fresh, otherwise empty directory under the system temporary directory and runs Tailwind's CLI with that directory as its working directory. Tailwind's automatic source detection then finds nothing, so the only content scanned is the consumer's `@source` globs, and nothing of the consumer's other files or of this package leaks classes into the output. The directory is removed in a `finally`, also when Tailwind fails. The tests hold both: a class only in an unlisted file in the working directory stays out, and the temporary directory is empty after a successful and a failed build.

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

Every failure the command handles prints one line, `codenhub-styles: <reason>`, to stderr and exits with status 1 without writing the output file. The reasons, each tested: a missing `--content` or `--output` (an `--output` of only spaces counts as missing); a `--content` glob that matches no file, naming the glob and the folder; an extra positional argument, almost always an unquoted glob the shell expanded; an unknown flag, or a flag missing its value or given one it does not take, worded from `parseArgs`'s error rather than passed through, since Node words those for programmers; an unknown aesthetic, listing the valid ones; a missing or unknown command; and a failed Tailwind run, reduced to Tailwind's own `Error:` line, such as `EISDIR` when `--output` names a folder.
