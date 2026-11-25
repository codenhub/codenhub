---
status: IMPLEMENTED
last_updated: 2026-11-25
scope: Design decisions, limits, and failure modes of the Vite plugin that ships in `@codenhub/styles` as `@codenhub/styles/vite`.
---

# Vite plugin

## Purpose

`viteStyles()` gives a Vite project that does not run Tailwind the trimmed stylesheet [`chs build`](./cli.md) writes, with no command to run and no file to name. The project keeps the import it already has, `import "@codenhub/styles"` in JavaScript or `@import "@codenhub/styles";` in CSS, adds the plugin to `vite.config.js`, and the build ships only the StyleKit classes its files use. The dev server follows the files as they change. The plugin is the recommended path for a Vite project; `chs build` stays the path for every other project, with a bundler or without one, and a project that runs Tailwind CSS v4 trims through the [source entrypoint](../integrating/tailwind.md) instead.

The source is `src/vite.ts` and `src/vite/`, bundled to `dist/vite.js` with its declarations by `pnpm build:vite`. The trimming engine both share is `src/trim/`. The tests are `tests/integration/vite.test.ts` and `tests/integration/vite-ignore.test.ts`. Public usage is in [Vite](../integrating/vite.md).

## One entry, one option

The plugin is the `./vite` export, a default export named `viteStyles` that is also exported by that name, as `@codenhub/icons/vite` exports `viteIcons`. It has one option, `content`: files or globs outside the Vite root to read as well, relative to the root, since everything under the root is read already. Nothing else is configurable: the aesthetics trimmed are the ones the project imports, and the output is the minified stylesheet the command writes by default.

Rejected: a second name, as icons' `viteIconsPlugin`, which would be one more export to document and keep. Rejected: options for the aesthetics, minification, or an output path, which the import already says or no reader needs.

`vite` is an optional peer, `>=5.0.0`. The plugin imports nothing from Vite at run time, only its types, so the peer is what tells a package manager the versions it supports. Its cost is that a project on Vite 4 or older fails `npm install @codenhub/styles` with `ERESOLVE` on `peerOptional vite@">=5.0.0"`, even when it only imports the compiled CSS and never loads the plugin; measured with npm 11.20 and Vite 4.5.14 on 2026-11-25. pnpm only warns. This is the cost [No Tailwind peer](./model.md#no-tailwind-peer) declined for Tailwind, accepted here because Vite 4 left support in 2024 and the group a peer protects, projects that run the plugin, is the group the package now serves through it. `tests/integration/exports.test.ts` holds that `vite` is the only peer and that it is optional.

## The import is swapped by an alias

In its `config` hook the plugin adds one `resolve.alias` entry per trimmed import, each a regular expression anchored at both ends, as `/^@codenhub\/styles(?=$|\?)/`, whose replacement is the trimmed file it wrote under Vite's cache folder. Every route by which Vite resolves the import reads `resolve.alias` before anything else: a JavaScript import, a CSS `@import` through Vite's own CSS resolver, a Sass `@use` or `@import` through Vite's Sass importer, an import a server-side rendering build inlines, and `?url`, `?inline`, and `?raw`, whose query the expression keeps; `tests/integration/vite.test.ts` runs each, and a JavaScript import and a CSS `@import` through Lightning CSS too. A Vue `<style>` block is a CSS module Vite processes the same way, which the suite does not run. The anchors keep `@codenhub/styles/components`, `/native`, `/theme`, `/palette`, every `/tw` path, and `/package.json` on the package's own files.

Rejected, with a prototype of each on Vite 5.4.21 and 8.3.6 on 2026-11-25, on branch `spike/styles-vite-plugin`:

- **Transforming every CSS module**, inlining its local `@import`s until the package's file is reached and replacing that with the trimmed CSS, as `@tailwindcss/vite` does with its own input. It passed the same 38 checks as the alias, but a Sass file that imports the package shipped the whole stylesheet, 253 to 255 KB, without a word, because Vite's Sass importer resolves the import itself and never hands the package's file to a CSS transform. Dev source maps lost every file below the one transformed. It took 146 lines to the alias's 79, would need a CSS bundler as a dependency to handle `layer()`, `supports()`, media conditions, and `url()` rebasing correctly, and takes over `@import` for every CSS file in the project.
- **Detecting Tailwind and redirecting the import to `/tw`.** A project that runs Tailwind through its CLI or PostCSS never loads the plugin, so it would detect nothing for them, and a project that runs `@tailwindcss/vite` imports `/tw` already.
- **One entry name that trims both with and without Tailwind.** Both paths resolve CSS through the same `style` condition, so one name cannot point at two files. Tailwind passes compiled CSS through untrimmed, and `/tw`'s `@utility` means nothing without Tailwind.

## Which imports are trimmed

The complete stylesheet, `@codenhub/styles`, and the aesthetics, `@codenhub/styles/aesthetics` and each `@codenhub/styles/aesthetics/<name>`, as `chs build` trims them with `--aesthetic`. The aesthetic names are read from the package's `exports`, as the command reads them, so a new aesthetic needs no change here. `/aesthetics` is trimmed from `dist/aesthetics/index.css`, the file it names, and each `/aesthetics/<name>` from its own.

`/components` and `/native` resolve to their compiled files, untrimmed, as they do without the plugin. `dist/purge/` is built from the complete stylesheet, which holds rules `/components` does not and differs from it in two rules, so trimming `/components` needs a source of its own. The prototype built one from the shipped files that trims byte for byte as `dist/components.css` does, at 290,291 bytes more for every install, which is rejected for that size: the trimming engine is planned to give way to [a build command that generates](./roadmap.md#possible), and both are trimmed then. `/theme` and `/palette` resolve to their compiled files too; they hold tokens and axis classes every component reads. The public guide says which imports are trimmed.

## Where the trimmed stylesheets are written

Every trimmed import is a file under `<cacheDir>/codenhub-styles/<key>/`: `index.css`, `aesthetics/index.css`, and `aesthetics/<name>.css`. The alias has to name a real file, because Vite's CSS and Sass resolvers do not ask plugins to resolve an import, so a virtual module would not reach them. The cache folder is where Vite keeps its own generated files: its watcher ignores it, and a project already keeps it out of version control. `<key>` is a hash of the root and the `content` option, so two configurations that read different files never share one, and two dev servers on one project share the same bytes.

The `config` hook runs before Vite resolves its configuration, so the cache folder is found as Vite finds it: `cacheDir` from the configuration resolved against the root, else `node_modules/.vite` beside the nearest `package.json`, else `node_modules/.vite` under the root when that folder exists, else `.vite` under the root. If a later Vite finds it elsewhere, the files still work where they are; the scan leaves out both folders. The folder is created on every write and taken as the system resolves it, so a cache deleted while the server runs, a Windows 8.3 short name, or a `subst` drive all name the module Vite loads. A `$` in the path is escaped in the replacement, which Vite applies as a `String.prototype.replace` pattern.

Each file is written to a temporary file beside it and renamed over it, so another server or build reading it never sees half a file. The command writes its output the same way, through the same code, `src/trim/write.ts`. All of them are written when the configuration is resolved, and each is rewritten only when its bytes change. `src/vite/trimmer.ts` holds the parsed stylesheets and handles one change at a time, in the order they come, so two writes of one file never race.

## A project's own alias wins

The plugin's `config` hook runs after every other plugin's, so it sees the aliases the project and its other plugins set. Vite puts a plugin's aliases ahead of the project's, so the plugin's would win; for each trimmed import an existing alias would resolve, by Vite's rule (a string matches itself and any path below it, a regular expression what it tests), the plugin adds none. It warns once for each such alias, naming the first import it maps, so an alias of `@codenhub/styles`, which maps every aesthetic too, gives one warning:

```text
@codenhub/styles/vite: resolve.alias already maps "@codenhub/styles", so that import keeps your alias and is not trimmed; remove the alias to trim it.
```

A project that aliases the package does so on purpose, to a fork or a vendored copy, and replacing what it chose would be a surprise. The warning is the signal that the plugin is doing nothing for that import. Rejected: overriding the alias, which breaks the project's choice silently, and failing the build, which blocks a project that wants the alias and the plugin for its other imports.

## Which files are read

Everything under the Vite root is read, as Tailwind's automatic source detection reads it, with these left out:

- **What `.gitignore` excludes.** The `.gitignore` in the root, in every folder below it, and in every folder above it up to the one that holds `.git`, or the root's alone when no folder above holds one, each relative to its own folder, with git's precedence: the last matching line wins, a deeper file overrides a higher one, and nothing under an excluded folder is read again. The root itself is never excluded, so a project in a folder its repository ignores is still read. The matcher is in-house, `src/vite/ignore.ts`, under [Few dependencies](../../../../docs/guidelines/code.md#few-dependencies), and `tests/integration/vite-ignore.test.ts` holds it to `git ls-files --others --exclude-standard` on the same files. It reads the same files with git or without it, as a Docker build without `.git` has them, which asking git would not. `.git/info/exclude` and a global excludes file are not read, so a build gives the same stylesheet on every machine. Matching is case-sensitive on every system, as git's is unless `core.ignorecase` is set.
- **`node_modules` and `.git`**, at any depth. A dependency's files name classes no page of the project uses.
- **Every build output folder inside the root**: `build.outDir` and, on Vite 6 and newer, each environment's. A build's output names the classes the last build kept, in its JavaScript and in CSS text inlined by `?inline` or an SSR build, so read back it would keep a class the sources no longer use, the reason the command leaves its output out. A folder that is the root, or holds it, is never left out. An output folder only another configuration names, such as `dist/server` from a separate `vite build --ssr` command, is read unless `.gitignore` excludes it, as the `.gitignore` of every create-vite template excludes `dist` and `dist-ssr`. Rejected: recording each build's folder under the cache folder for the next, which is one more file to keep for a case `.gitignore` already covers.
- **Vite's cache folder and the plugin's own.**
- **Stylesheets**, the extensions Vite processes as CSS: `.css`, `.less`, `.sass`, `.scss`, `.styl`, `.stylus`, `.pcss`, `.postcss`, and `.sss`. A property value is a word too, and `border: 1px solid` keeps `.solid`; Tailwind leaves them out for the same reason. The CSS inside a Vue or Svelte file is read with the rest of the file.
- **Binary files**, by git's rule: a file with a NUL byte in its first 8,000 bytes, unless it starts with a UTF-16 byte order mark. Only those bytes are read from such a file, so a video in `public/` costs nothing. Rejected: a list of binary extensions, which is never complete.
- **Copies of the package's own files**, by the command's rules in [How classes are found](./cli.md#how-classes-are-found).

A link to a file is read; a link to a folder is not followed, so a link cycle cannot hang the scan. A file or folder the scan cannot read fails startup naming it, as the command does, rather than build without its classes; the message says to fix its permissions or add it to `.gitignore`.

`content` adds files outside the root, such as a shared template folder in a monorepo. Each entry is resolved against the root with the command's rules, so a wildcard stays out of `node_modules` unless the entry names it, and fails the same way when it matches nothing. The files it names are read whatever the filters above say, a stylesheet or a file `.gitignore` excludes included, except for a copy of the package's files.

Words are found as the command finds them, by `findClasses` in `src/trim/`.

## The same stylesheet as `chs build`

The plugin and the command share `src/trim/`: the same purge source, `dist/purge/index.css`, the same `classes.json`, the same word rules, and the same serializer, so for the same class set the plugin writes the command's output byte for byte. The trimmed complete stylesheet is what `chs build` writes, and that file followed by a trimmed aesthetic is what `chs build --aesthetic <name>` writes; `tests/integration/vite.test.ts` holds both. `src/trim/` was moved out of `src/cli/` for the plugin, with the command's tests unchanged.

The plugin always writes minified CSS, the command's default. In dev the file is read only by Vite, and its source maps name it, so a readable copy would buy nothing a reader asks for.

## Live update

The dev server follows every file the scan reads, with no reload by hand:

- **Vite 6 and newer** call `hotUpdate` once per environment, for a file changed, created, or deleted. The plugin re-reads the file once per change, whichever environment comes first, and when the set of classes changed it rewrites the trimmed files whose bytes changed and returns their modules with the others, so a stylesheet imported from JavaScript updates in place and one imported from CSS updates its importer. Its hook runs after every other plugin's, since a framework's plugin may pick the modules a change updates and would leave the stylesheets out. A change that names the same classes, or rewrites no file, returns nothing, so Vite updates what it would without the plugin.
- **Vite 5** calls `handleHotUpdate` for a change only, and no hook at all for a file created or deleted, so the plugin listens on the server's watcher for those and reloads the trimmed modules itself with `server.reloadModule`. Vite 6 and newer skip `handleHotUpdate` for a plugin that has `hotUpdate`, so the two never both run.
- **An HTML file** has no module, and Vite reloads the page for it only when no module updates. The plugin invalidates the trimmed modules and their importers instead of returning them, so the page Vite reloads gets the new stylesheet.
- **A `.gitignore`** created, changed, or deleted changes what is read, so the whole root is read again.
- **`content` outside the root** is added to the server's watcher, from each entry's path up to its first wildcard. A file created there is found by resolving the entries again when it lands in a folder an entry reads from. A file under `node_modules` is not followed, since Vite's watcher leaves that folder out by default.
- **A trimmed file that cannot be written** is shown on the page as Vite shows a hook's error, and written on the next change, whether or not that change names a new class.

`vite build --watch` follows the files the build read when it started: the plugin adds each one to the build's watch list in `buildStart`, so changing or deleting one rebuilds, and `watchChange` re-reads it before the rebuild loads the trimmed file. A file created under the root while the build runs is read when the build is started again; its folder is not watched. The dev server calls `watchChange` too, so there it does nothing and `hotUpdate` does the work, which keeps one change from being read twice and the second read from finding nothing to update.

A stylesheet that imports the package needs one more step on Vite 5 to 7. Rollup keeps the module it transformed before when the module's own text is unchanged, and Vite's watcher ignores the cache folder, so a rebuild would keep the trimmed text the stylesheet inlined the last time. When a change rewrote a trimmed file, the plugin's `shouldTransformCachedModule` asks for every CSS module to be transformed again in the next build. Vite 8 does not call that hook. Its watcher sees the trimmed file change instead, so a change that rewrites the trimmed file rebuilds twice, measured on 8.3.6 on 2026-11-25. Rejected: watching the root with `addWatchFile`, which would also rebuild for a file created, because on 8.3.6 it rebuilt without end.

## Node.js and Vite versions

The plugin needs Node.js 24 or newer, the package's floor, as [Node.js version](./cli.md#nodejs-version) records. Vite 5 runs on Node.js 18, so `viteStyles()` checks the version when the configuration calls it and fails naming both versions, before the scan uses `globSync`, which Node.js 22 added. The check reads the floor the command reads.

The integration suite runs against the catalog's Vite, and `.github/workflows/vite.yml` runs it against the floor of the peer range, 5.0.0, and the newest 5.x, 6.x, and 7.x, as `tailwind.yml` runs the Tailwind suite against other releases. Each job installs that Vite under the name `vite-under-test`, because Vitest 4 needs Vite 6 or newer as its own peer, and `tests/integration/vite.test.ts` loads `VITE_UNDER_TEST` when it is set.

## Limits

- **Classes are found as words**, as the command finds them; a class assembled at render time is never found, and a word that only looks like a class is kept.
- **Files outside the root are read only when `content` names them.** A component library that names StyleKit classes from `node_modules` adds nothing until its files are listed.
- **Only the complete stylesheet and the aesthetics are trimmed**, as [Which imports are trimmed](#which-imports-are-trimmed) records.
- **`.git/info/exclude`, a global excludes file, and `core.ignorecase` are not read**, as [Which files are read](#which-files-are-read) records.
- **A project that aliases the package keeps its alias**, untrimmed, with a warning.
- **`vite build --watch` reads a file created while it runs only when it is started again**, as [Live update](#live-update) records.

## Failure modes

Every failure is thrown as an `Error` whose message starts with `@codenhub/styles/vite: ` and says what to do; Vite prints it and stops the build or the server's start. `tests/integration/vite.test.ts` runs each one. The reasons: a Node.js older than 24, naming both versions; a `content` that is not an array of strings, or that holds an empty one; a `content` entry that matches no file, naming the entry and the root, with the likelier causes the scanner names, as [Content globs that match nothing](./cli.md#content-globs-that-match-nothing) records; a file or folder the scan cannot read, with Node.js's code, naming it; and a trimmed file or its folder that cannot be written, with Node.js's reason and code and the advice to set `cacheDir` to a folder the build can write to. In the dev server, a write that fails after startup is shown on the page instead, as [Live update](#live-update) records.

The warning for an alias the project set is the one message that does not stop anything.
