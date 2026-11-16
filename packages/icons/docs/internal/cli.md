---
status: IMPLEMENTED
last_updated: 2026-11-16
scope: Design decisions, options, limits, and failure modes of the `chi` build command in `@codenhub/icons`, and the private scanner it shares with `@codenhub/styles`.
---

# Build command

## Purpose

`chi build` writes a stylesheet holding the icons a project's files use, for a project that runs neither Tailwind CSS, Vite, nor PostCSS. Without it, such a project has one route: a complete family stylesheet, such as `@codenhub/icons/lucide` at about 1.3 MB, where the plugins write about 10 KB for a page with three icons. The stroke-width modifier, `ic-lucide-heart/1.5`, also needs a plugin today. The command closes both gaps with what the package already has: the scanner, the registry, and the generator the plugins use. It makes Tailwind CSS one adapter among three build integrations, as [Few dependencies](../../../../docs/guidelines/code.md#few-dependencies) asks, rather than the shortest route to small output.

It lands in 0.4.0, the release being prepared, and adds a `bin` to the package. It mirrors `chs build` in `@codenhub/styles`, whose [Build command](../../../styles/docs/internal/cli.md) records the decisions this one shares: one command inside the package, no configuration file, Node.js built-ins only, and one line on stderr for each failure.

## One package, one `bin`

The command ships inside `@codenhub/icons` as its `bin`, named `chi`, so a consumer runs it from a `package.json` script as `chi build …`, or as `npx @codenhub/icons build …`, which runs the package's only `bin`. The pair `chs` and `chi` names the two commands after the two packages.

The public documentation never shows `npx chi`. An unrelated package named `chi` exists on npm, version 0.0.10, a router for Express, checked on 2026-11-16; `npx chi` runs it wherever this package is not installed.

Rejected: a separate CLI package, for the reasons `@codenhub/styles` rejected `@codenhub/styles-cli`: a second name to find and install, and a second version to match to the icons it builds.

## The command generates; it does not trim

`chs build` trims a stylesheet compiled in advance. This command cannot, and writes each rule instead, as the plugins do:

- **A complete source is too large.** Every icon of every family, compiled once, is about 39 MB, and every build would read it to keep a few kilobytes.
- **The classes are open.** A stroke width is any number, `ic-lucide-heart/1.5` or `/1.75`, so no file compiled in advance holds every rule a project can name.

The command therefore runs the same generator as the PostCSS plugin, over the same classes, so a project gets the same rules from either. That equivalence is what the tests hold: for one set of content files and options, the command's output and the PostCSS plugin's appended CSS are the same.

## Options

Each option is the PostCSS plugin's, with the same default, so moving a project between the two changes nothing in its output. The one default that differs is `families`, as the table says.

| Flag                          | PostCSS option  | Default                                                     |
| ----------------------------- | --------------- | ----------------------------------------------------------- |
| `-c`, `--content <glob>`      | `content`       | Required. Repeatable.                                       |
| `-o`, `--output <file>`       | none            | Required. Parent directories are created.                   |
| `--family <prefix>`           | `families`      | Every family except the brand ones. Repeatable.             |
| `--default-prefix <prefix>`   | `defaultPrefix` | None: a bare name such as `ic-heart` resolves only with it. |
| `--prefix <prefix>`           | `prefix`        | `ic`                                                        |
| `--stroke-width <width>`      | `strokeWidth`   | None: each family's authored width.                         |
| `--no-base`                   | `injectBase`    | The base rules are written.                                 |
| `--attribution <auto \| off>` | `attribution`   | `auto`                                                      |
| `--help`, `--version`         | none            |                                                             |

**`--family` defaults to every non-brand family**, as `/tw` does, where the PostCSS plugin resolves no family until one is passed. A plugin takes family data as a JavaScript import, so naming none costs a line of configuration; a command line has no import to make, and an empty default would write an empty stylesheet. Brand families, `simple-icons` and `logos`, are added only by name, for the reason `/tw` leaves them out: their marks carry trademark terms a project should choose to take on. Unlike the Tailwind plugin, the command may load only the families a found class or `--default-prefix` names, because nothing forces it to load them all at once.

**`--attribution`** takes the two modes the PostCSS plugin has. `auto` writes the license notices of the families the output used as a preserved comment at its top; `off` writes none and warns on stderr when a used family still requires one. The Vite plugin's `file` mode is left out: the command already writes one file, and the notices travel in it.

## What it leaves out

- **Inline SVG mode and per-icon modules.** Both rewrite source files or serve modules to a bundler, which a command that writes a stylesheet cannot do. A project that needs them uses the Vite plugin.
- **A custom registry and adopted sets.** `registry` and `adoptIconifySet` take JavaScript values. A project that adopts a third-party set uses a plugin, until a consumer asks for a flag that reads a set from a file.
- **A configuration file, watch mode, and other commands.** Left out until a consumer needs them, as in `chs`.
- **Minification.** The generator's output is written as it is; a project that minifies its CSS does so in its own pipeline, as it does for the plugins' output.

## How classes are found

Content is read as text and never run. The command finds icon classes as the plugins do, with the pattern of `src/scanner/class-scanner.ts`: the class prefix, a dash, a name, and an optional stroke modifier, so `ic-lucide-heart/1.5` is one class. Relative paths and globs are read from the working directory, as in the PostCSS plugin.

Reading the files is the job of the [shared scanner](#the-shared-scanner); which words count as icon classes stays in this package.

## Content globs that match nothing

Each `--content` entry has to name at least one file, and each file it names has to be readable, or the command fails without writing the output. A build from missing content writes a stylesheet without some icons, which on a deploy is a site whose icons silently vanish.

The plugins keep their behavior: an entry that names no file, or a file that cannot be read, contributes nothing. `scanFiles` is a public export whose TSDoc promises that, and a plugin that starts failing on such an entry would break a build that works today. Whether the plugins should warn on one is a separate question, not settled here.

## Classes that resolve to no icon

The command warns on stderr, once, with every class it found that resolves to no icon, such as a misspelled `ic-lucide-hart`, and still writes the output and exits with status 0. Failing would stop a build over a word that only looks like a class, such as `ic-` text in a comment, which the scanner cannot tell from a real one.

The plugins cannot do this, as [Roadmap](./roadmap.md) records, because they see classes one module at a time and never know the set is complete. The command reads every content file before it writes, so it does know.

## The shared scanner

Finding classes in files is the same work in both build commands: expand each content entry into files, read each file as text, and fail when an entry names no file. It lives in a private workspace package, `@codenhub/scan` in `packages/scan`, that both `@codenhub/icons` and `@codenhub/styles` inline, as [A private workspace package](../../../../docs/specs/packages-lifecycle.md#a-private-workspace-package) describes.

**What it holds:**

- Resolving an entry: tried as a literal path first, so a real file whose name holds a bracket, such as Next.js's `app/[id]/page.tsx`, is read rather than taken as a pattern, and expanded as a glob only when no such file exists. That is the behavior of `scanFiles` today. For `chs`, it fixes a literal path with a bracket, which `fs.glob` reads as a pattern and fails to match; the `@codenhub/styles` changelog names that fix in the release that takes the scanner.
- Reading each file as UTF-8 text, one at a time, so a glob that matches thousands of files stays under the open-file limit, as `chs` reads them today.
- Splitting text into words by the characters a word may hold, which the caller gives. Styles gives the ones a class name holds, and keeps its own second reading of a word around each colon. Icons does not split: its class pattern finds where a class starts and ends in the raw text, so a split first finds the same classes, measured about six times slower on 2.6 MB of text, and `scanIconClasses` runs on every module the Vite plugin transforms.
- Two strict modes the caller turns on: failing on an entry that names no file, with a message naming the entry and the folder it was read from, and failing on a file that cannot be read, with Node.js's own message. Both commands turn both on, as `chs` behaves today; `scanFiles`, and so the plugins, turn both off, as it behaves today.

**What it leaves to each package:** which words count, what is written, and every message about the package's own classes. The split keeps a change to the scanner from changing what either command emits for a class it already found.

**Why private.** It has two consumers, both in this repository, and no consumer outside it. A public package would add a published contract, a version for both packages to match, and a release to make before either could use a change. Inlined, it changes in the same pull request as both packages, which is what keeps them from drifting apart. The cost, two packages carrying different revisions until each releases, is bounded by the rules in the lifecycle specification.

Rejected:

- **A scanner in each package.** Today's state: `src/scanner/class-scanner.ts` here and `findFiles` in `@codenhub/styles`. The two already differ, one failing on an entry that matches nothing or a file it cannot read and the other skipping both, one reading a literal path first and the other not, and every fix would be made twice.
- **One engine for both packages**, scanning and writing CSS. The two write CSS in opposite ways, as [The command generates](#the-command-generates-it-does-not-trim) says, so what they share stops at the words. An engine that held both ways would need candidates, providers, variants, and layer order, which is a general CSS compiler with two consumers to design it from.
- **A public scanner package.** Rejected for now for the reasons under "Why private". Worth deciding again when a third consumer needs it, or when keeping two packages on one revision costs more than a release would.

## Dependencies

The command imports Node.js built-ins, this package's own modules, and the inlined scanner, and nothing else, which a test checks of the built `bin`, as `@codenhub/styles` checks `dist/cli.js`. The family data it loads is this package's own `dist/data/`, resolved from the package's files rather than through its name, as `chs` finds its root.

## Node.js version

The package declares `engines.node` as `>=26` since 0.4.0, and the command checks the running version itself before it reads a file, naming both versions, as `chs` does.

## Failure modes

Every failure the command handles prints one line, `chi: <reason>`, to stderr and exits with status 1 without writing the output file:

- a missing `--content` or `--output`;
- a `--content` entry that names no file, naming the entry and the folder, or a file it names that cannot be read;
- an extra positional argument, almost always an unquoted glob the shell expanded;
- an unknown flag, or a flag missing its value or given one it does not take;
- an unknown family or default prefix, listing the valid ones;
- an `--attribution` other than `auto` or `off`, or a `--stroke-width` that is not a positive number;
- a missing or unknown command;
- a Node.js older than 26, naming both versions;
- a failed write, with Node.js's own message.

The output is written beside its target and renamed over it, as `chs` does, so a write that fails partway leaves the previous stylesheet whole rather than a truncated one a deploy would ship.

A class that resolves to no icon is a warning, not a failure, as [Classes that resolve to no icon](#classes-that-resolve-to-no-icon) says.
