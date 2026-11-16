---
title: Build command
description: Writes a stylesheet holding only the icons your files use, for a project that runs neither Tailwind CSS, Vite, nor PostCSS.
order: 5
---

# Build command

For a project with no Tailwind CSS, Vite, or PostCSS, such as a Rails, Laravel, or Django app, or a static site, the `build` command reads your files, finds the icon classes they use, and writes a stylesheet holding only those icons. A page with three icons gets about 10 KB of CSS rather than a complete family stylesheet, where Lucide alone is about 1.3 MB, and the `ic-lucide-heart/1.5` stroke-width modifier works as it does with the plugins.

Run it from a `package.json` script, where the package's command is named `chi`:

```json
{
  "scripts": {
    "build:icons": "chi build --content \"app/views/**/*.erb\" --output public/icons.css"
  }
}
```

Or run it once without a script:

```sh
npx @codenhub/icons build --content "app/views/**/*.erb" --output public/icons.css
```

Use `npx @codenhub/icons`, not `npx chi`: an unrelated package named `chi` exists on npm, and `npx chi` runs it wherever this package is not installed.

Then link the stylesheet it wrote. It already holds the base `.ic` rules, so nothing else is imported:

```html
<link rel="stylesheet" href="/icons.css" />
```

Run the command again whenever your files change which icons they use, before each deploy at the least. It writes the same rules the [PostCSS plugin](postcss.md) appends for the same files and options, so a project can move between the two without its CSS changing.

## Options

| Flag                          | Purpose                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `-c`, `--content <glob>`      | Files to read for icon classes. Required and repeatable.                                    |
| `-o`, `--output <file>`       | Stylesheet to write. Required. Parent folders are created.                                  |
| `--family <prefix>`           | A family to resolve icons from. Repeatable. Defaults to every family except the brand ones. |
| `--default-prefix <prefix>`   | Family a bare name, such as `ic-heart`, resolves against. Without it, none resolves.        |
| `--prefix <prefix>`           | Class prefix. Defaults to `ic`.                                                             |
| `--stroke-width <width>`      | Default for stroke-based families whose classes carry no modifier.                          |
| `--no-base`                   | Leave out the base `.ic` rules, for a page that loads them from `@codenhub/icons` already.  |
| `--attribution <auto \| off>` | `auto` writes the license notices as a comment at the top; `off` writes none. See below.    |
| `--help`, `--version`         | Print the usage or the package version.                                                     |

Each option is the PostCSS plugin's, with the same default, except `--family`. The plugin resolves no family until you pass one, while the command resolves every family except `simple-icons` and `logos`, the brand families, whose marks carry their owners' trademark terms. Name a brand family to use it, along with every other family you use, since naming one replaces the default:

```sh
npx @codenhub/icons build --content "templates/**/*.html" --output static/icons.css --family lucide --family simple-icons
```

`--content` reads globs as the PostCSS plugin does: relative to the folder you run the command in, with `**` for any number of folders and `{html,erb}` for either extension. A path that names an existing file is read as that file, even when its name holds a bracket, such as Next.js's `app/[id]/page.tsx`. Quote each glob, with `\"` inside a `package.json` script, so your shell does not expand it first.

Write every icon class out in full in a file the command reads: a class assembled at runtime, such as `` `ic-${name}` ``, is not in the files, so its icon gets no rule and no warning. When the name comes from data, list each class it can take in full in a file under `--content`.

## Attribution

With `--attribution auto`, the default, the stylesheet starts with a preserved comment carrying the license notice of each family it used. A minifier keeps it unless it is set to drop legal comments, as `legalComments: "none"` is, so keep legal comments in your minifier's configuration. With `off`, it carries none, and the command warns when a family it used requires a notice, so you can ship that notice another way. [Licensing](../licensing.md) explains what each family requires.

## Failures and warnings

The command stops, writes nothing, and prints one line starting `chi:` when the build would be wrong:

- **`--content "<glob>" matches no file in <folder>`.** Usually a typo, or the command running from another folder than your project root. A build from missing files would write a stylesheet without some icons, and the site would lose them silently.
- **A file it cannot read**, with Node.js's own message.
- **`unexpected argument "<file>"`.** Almost always a `--content` glob without quotes, which your shell expanded. Quote the glob.
- **`unknown family`, `unknown default prefix`**, listing the valid ones, and **an `--attribution` other than `auto` or `off`**, or **a `--stroke-width` that is not a positive number**.
- **A Node.js older than 26**, naming both versions.

A class that resolves to no icon, such as a misspelled `ic-lucide-hart`, is a warning, not a failure: the command lists every such class once and still writes the stylesheet. A word that only looks like a class, such as `ic-` text in a comment, would otherwise stop a build.

## What it does not do

- **Inline SVG and per-icon modules.** They change your source files or serve modules to a bundler. Use the [Vite plugin](vite.md).
- **A custom registry or an adopted icon set.** These take JavaScript values. Use a plugin.
- **Watch mode, a configuration file, and minification.** Run the command from your own watcher or build script, and minify its output in your own pipeline if you minify CSS.

## See also

- [Delivery methods](index.md) — how the methods compare.
- [PostCSS plugin](postcss.md) — the same rules, from a PostCSS pipeline.
- [Frameworks](../frameworks/index.md) — next on the reading path.
