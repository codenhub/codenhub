---
title: Vite
description: Shipping only the classes your pages use from a Vite project that does not run Tailwind, with the package's Vite plugin.
order: 6
---

# Vite

The compiled stylesheet holds every class the package has, so a settings page that uses a few buttons, a card, and a form ships the tables, tooltips, and alerts too, in case it changes its mind. In a Vite project that does not run Tailwind CSS, the package's Vite plugin fixes that without touching your imports. When Vite starts, it reads your project's files for class names and swaps the stylesheet you import for one with only the StyleKit classes those files use, and the [Tailwind utilities](./without-a-bundler.md#tailwind-utilities) they name, such as `flex` and `mt-4`. There is no command to run and no output file to name: you add one line to `vite.config.ts`, and the rest of the project stays as it was.

A project that already runs Tailwind CSS v4 does not need the plugin. Its own build trims the [source entrypoint](./tailwind.md) the same way. A project without Vite, with another bundler or none, writes the trimmed stylesheet with the package's [`chs build` command](./without-a-bundler.md#build-only-the-classes-you-use) instead.

## Add the plugin

With the package installed as in [Setup](../setup.md#install), add the plugin to your Vite configuration:

```ts
// vite.config.ts
import viteStyles from "@codenhub/styles/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [viteStyles()],
});
```

`viteStyles` is also exported by that name, as in `import { viteStyles } from "@codenhub/styles/vite"`.

Keep the import you already have, from your JavaScript entry or your global stylesheet:

```ts
// main.ts
import "@codenhub/styles";
```

```css
/* app.css */
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics/neobrutalism";
```

That is the whole setup. `vite` and `vite build` now serve and ship a stylesheet trimmed to the classes the settings page names: `section`, `stack`, `text-title`, `btn`, and the rest, and none of the components it never uses.

Measured with Vite 8.3.6 on a page with one `btn primary` button, the build ships about 38 KB of CSS (8 KB with gzip), where the same page without the plugin ships about 255 KB (21 KB). Both figures include what Vite 8's own CSS minifier adds: for its default browser targets, it writes a fallback beside each `light-dark()` color, with the plugin or without it. The file the plugin hands Vite is the one `chs build` writes for the same page, byte for byte.

## Which imports are trimmed

The complete stylesheet and the aesthetics are trimmed. The other stylesheets load whole, exactly as they do without the plugin:

| Import                                             | Through the plugin                           |
| -------------------------------------------------- | -------------------------------------------- |
| `@codenhub/styles`                                 | Trimmed to the classes your files use.       |
| `@codenhub/styles/aesthetics`                      | Trimmed, each aesthetic to the classes used. |
| `@codenhub/styles/aesthetics/<name>`               | Trimmed to the classes used.                 |
| `/components`, `/native`, `/theme`, and `/palette` | Whole.                                       |
| The `/tw` paths                                    | Left alone; they are Tailwind source.        |

So to ship less, import the complete stylesheet rather than `/components`. For the one-button page above, the trimmed stylesheet is about a fifth of the 186 KB `/components` loads whole. The trimmed stylesheet is built from the complete one, not from `/native`, so it has no classless mappings; a page that relies on them imports `/native`, which loads whole.

The import is trimmed wherever Vite resolves it: a JavaScript `import`, a CSS `@import`, a CSS file that another CSS file imports, a Sass `@use` or `@import`, Lightning CSS as Vite's CSS transformer, and Vite's `?inline`, `?url`, and `?raw` queries. A Sass `pkg:` URL, as in `@use "pkg:@codenhub/styles"`, is the exception: Sass resolves it without asking Vite, so the whole stylesheet ships. Write `@use "@codenhub/styles"` instead.

The trimmed stylesheet holds what [`chs build`](./without-a-bundler.md#options) writes: the theme and its tokens, the reset, the base rules every component relies on, the four classes kept whether or not a file names them (`.dark`, `.theme-dark`, `.theme-light`, and `.disabled`), each StyleKit class your files use, and each [Tailwind utility](./without-a-bundler.md#tailwind-utilities) they name, written into the complete stylesheet and never into an aesthetic. It is always minified. An aesthetic you import is trimmed the same way, to its rules for the classes your files use; the import already says which aesthetics you want, so there is nothing to configure.

## Which files are read

Everything under Vite's root is read: the folder you run Vite in, unless the command names another, as in `vite build apps/web`, or your configuration sets [`root`](https://vite.dev/config/shared-options.html#root). Tailwind's automatic source detection reads a project the same way. A few things are left out, each because reading it would keep classes your pages do not use:

- **What your `.gitignore` excludes.** The `.gitignore` in the root, in every folder below it, and in every folder above it up to the one that holds `.git`, with git's rules: the last matching line wins, and a deeper file overrides a higher one. The root itself is never left out, even when the repository ignores it with a line such as `playground/`. A line that names the files under the root rather than the folder, such as `playground/**`, does leave them out; name them in [`content`](#files-outside-the-root), as in `content: ["index.html", "src/**/*"]`, or change the line to the folder's own name. `.git/info/exclude` and a global excludes file are not read, and matching is case-sensitive on every system, so every machine builds the same stylesheet.
- **`node_modules` and `.git`**, at any depth. A dependency's files name classes no page of yours uses.
- **Vite's build output.** `build.outDir` and, on Vite 6 and newer, each environment's output folder, plus Vite's cache folder. A build's output names the classes the last build kept, so reading it back would keep a class your sources no longer use. An output folder that only another configuration names, such as `dist/server` from a separate `vite build --ssr` command, is read unless `.gitignore` excludes it; the `.gitignore` of every create-vite template excludes `dist` and `dist-ssr`.
- **Stylesheets**: `.css`, `.scss`, `.sass`, `.less`, `.styl`, `.stylus`, `.pcss`, `.postcss`, and `.sss`. A property value is a word too, and `border: 1px solid` would keep `.solid`. The CSS inside a `.vue` or `.svelte` file is read with the rest of the file.
- **Binary files**, by git's rule: a file with a NUL byte in its first 8,000 bytes, unless it starts with a UTF-16 byte order mark. Only those bytes are read, so a video in `public/` costs nothing.
- **Copies of the package's own files**, such as a stylesheet that `chs build` wrote or a copy of the package's class list, by the rules in [How classes are found](./without-a-bundler.md#how-classes-are-found). Each names every class the package has and would keep the whole stylesheet.

A link to a file is read; a link to a folder is not followed, so a link that loops back cannot hang the scan.

Class names are found as words, as the `chs build` command finds them: a class written whole in any file counts, and a class your code assembles while rendering, as in `` `btn ${tone}` ``, is never found. [How classes are found](./without-a-bundler.md#how-classes-are-found) explains the rules and the two ways out. One of them gets easier here: a safelist is any text file under the root, such as `stylekit-classes.txt` with one class name per line, and the plugin reads it like the rest, with no option to set. The ten variant prefixes, such as `md:lg` and `hover:primary`, work as [Variants](./without-a-bundler.md#variants) describes.

## Files outside the root

The `content` option adds files outside the root, such as a shared component folder in a monorepo. It is the plugin's only option:

```ts
// apps/web/vite.config.ts
export default defineConfig({
  plugins: [viteStyles({ content: ["../../packages/ui/src/**/*.{vue,ts}"] })],
});
```

Each entry is a path or a glob, read from the Vite root, with the command's glob rules from [Options](./without-a-bundler.md#options). The files an entry names are read even where a `.gitignore` excludes them, and a `*` or `**` does not enter a `node_modules` folder, so a component library you install adds its classes only when you name it, as in `node_modules/some-ui/dist/**/*.js`. Each entry has to match at least one file, or Vite fails to start and names it, so a typo cannot quietly drop a folder's classes.

## While you work

The dev server follows your files as they change, with no reload by hand:

- **Saving a file that names a new class** updates the stylesheet in place. Removing the last use of a class drops its rule.
- **Creating or deleting a file** counts as a change to its classes.
- **Saving an HTML file** reloads the page, as Vite does for HTML, and the page it reloads gets the new stylesheet.
- **Changing a `.gitignore`**, under the root or above it, reads the whole root again, since it changes what is read. A `.gitignore` created above the root while Vite runs is read at the next start.
- **A file a `content` entry names** is followed too, and so is a file created in a folder an entry reads from.

The stylesheet a server-side render loads follows the same changes, and a server-side rendering build inlines the trimmed stylesheet where it inlines CSS.

`vite build --watch` follows the files it has read. Saving one rebuilds with its classes, even when no module imports it, such as an HTML template your server renders, and deleting one drops them. Each rebuild reads the project again, so a file created while it runs counts from the next rebuild, which saving any file it already follows starts. On Vite 8, a change that changes the stylesheet rebuilds twice in a row, and the second build writes the same files as the first.

## Where the trimmed files live

The plugin writes the trimmed stylesheets into Vite's cache folder, `node_modules/.vite/codenhub-styles/` unless your configuration sets [`cacheDir`](https://vite.dev/config/shared-options.html#cachedir). That is where Vite keeps its own generated files, so your project already keeps it out of version control. Deleting it is safe: the plugin writes it again when Vite starts, and, if you delete it while the dev server runs, when you restart the server or save a change that adds or removes a class. The browser's dev tools show the stylesheet at its path in that folder rather than in the package.

## Your own alias wins

If your configuration or another plugin already maps `@codenhub/styles` in `resolve.alias`, to a fork or a vendored copy, say, that import keeps your alias and is not trimmed. Vite prints one warning when it starts:

```text
@codenhub/styles/vite: resolve.alias already maps "@codenhub/styles", so that import keeps your alias and is not trimmed; remove the alias to trim it.
```

Remove the alias to trim the import. The imports your alias does not map, such as an aesthetic, are still trimmed.

## Requirements

- **Vite:** 5.0.0 or newer. The package lists Vite as an optional peer dependency, so installing the package never installs Vite. A project on Vite 4 or older cannot `npm install @codenhub/styles`, even when it never loads the plugin: npm stops with `ERESOLVE`, naming `peerOptional vite@">=5.0.0"`. Upgrade Vite, or install with `npm install --legacy-peer-deps`, which turns off npm's peer check for that whole install. pnpm only warns.
- **Node.js:** 24 or newer on the machine that runs Vite. Vite 5 itself runs on Node.js 18, so the plugin checks the version and fails with a message rather than half-working.
- **Tailwind:** none. A project that runs Tailwind CSS v4 trims through the [source entrypoint](./tailwind.md) and does not need the plugin.

## When Vite fails to start

Every message the plugin prints starts with `@codenhub/styles/vite:`, and a failure while Vite starts stops the server or the build, so a typo cannot ship a stylesheet without your classes. The message says what went wrong and what to do:

- **`this plugin needs Node.js 24 or newer; this is Node.js <version>`.** Update Node.js on the machine that runs Vite.
- **`content must be an array of paths or globs`.** The option was given something other than a list of strings, such as `content: "../shared/**/*.html"`. Put the glob in a list, as in `content: ["../shared/**/*.html"]`.
- **`content holds an empty entry`.** An entry is empty or only spaces, as an unset environment variable gives. Remove it, or name a path or glob.
- **`content "<entry>" matches no file in <root>`.** The entry is read from the Vite root the message names, which need not be the folder that holds the configuration file, so check the path from there. When a likelier cause is known, the message names it instead: a `*` or `**` that matched files only inside `node_modules`, which it does not enter, or a `[` read as the start of a set of characters, where `[[]` would match the bracket.
- **`content "<entry>" is a folder in <root>, not a file`.** Name the files in it, as in `../shared/**/*`.
- **`cannot read "<path>" (<code>)`.** The plugin could not read a file or list a folder, usually for its permissions, with Node.js's code, such as `EACCES`. Building without it would drop its classes, so the plugin stops instead. Fix its permissions, or, as the message says, add it to `.gitignore` when it is under the root, or change `content` when an entry names it. A `.gitignore` is read before any rule applies, so for one the message says to remove it instead.
- **`cannot write to "<path>": <reason> (<code>); fix that, or set cacheDir to a folder you can write to`.** The plugin could not write the trimmed stylesheet into Vite's cache folder. `<reason>` and `<code>` are Node.js's own; `EACCES` or `EPERM` means you cannot write there, and `ENOSPC` that the disk is full.
- **`a file changed before the plugin read the project; restart Vite`.** Restart Vite.

While the dev server runs, an error from a change, such as a stylesheet it cannot write, is shown in the page as Vite shows its own errors, and in the terminal. The page keeps the stylesheet written last, and the next change you save tries the write again.

## Verifying it worked

Render one styled element, as in [Integrating → Verifying it worked](./index.md#verifying-it-worked):

```html
<button class="btn primary">Save changes</button>
```

A rounded button filled with the primary color means the stylesheet loaded. To see the trimming, run `vite build` and compare the size it prints for the CSS file in `dist/assets/` with the size it prints without the plugin.

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. Each class you add there lands in the stylesheet as soon as you save.
