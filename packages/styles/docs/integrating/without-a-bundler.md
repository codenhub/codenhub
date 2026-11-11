---
title: Without a bundler
description: Linking the compiled stylesheets from plain HTML, Rails, Laravel, Django, or any server-rendered app, and the command-line build.
order: 6
---

# Without a bundler

The compiled stylesheets are finished CSS: each one is a single file with no `@import` and no reference to another file, and every image it draws is embedded as a `data:` URL: the checkbox tick and dash masks, and the SVG lens filters `.glass-liquid` uses. A page can load one with a plain `<link>` tag, from any server, with no build step, and the stylesheet makes no further requests.

What needs a build tool is the import _name_. `@import "@codenhub/styles"` names a package, and finding the file behind that name — `node_modules/@codenhub/styles/dist/index.css` — is done by Node-aware tooling such as Vite, webpack, or the Tailwind CLI, which read the package's `exports` map. A browser does not: it resolves an `@import` URL against the stylesheet that contains it and a `<link href>` against the page, so a bare package name becomes a request for a path that does not exist. Without a bundler, link the file by its path instead.

The `/tw` entrypoints are Tailwind source and need a Tailwind build. `/tw/aesthetics` is the exception, plain CSS with nothing for Tailwind to process, but without a bundler link the compiled `dist/aesthetics/` files instead, as below. This page is for a page that has no Node.js CSS build: plain HTML, Rails, Laravel, Django, or any server-rendered app. There are two paths:

1. **Link the compiled stylesheet.** Works today, with nothing but static files. You ship every class, whether your pages use it or not.
2. **Build a stylesheet with the package's `build` command.** It scans your templates and writes a stylesheet with only the classes they use. See [Build only the classes you use](#build-only-the-classes-you-use).

## Which file to link

Each compiled import path is one file in the package's `dist/` folder:

| Import path                     | File                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| `@codenhub/styles`              | `dist/index.css`                                                  |
| `@codenhub/styles/theme`        | `dist/theme.css`                                                  |
| `@codenhub/styles/components`   | `dist/components.css`                                             |
| `@codenhub/styles/native`       | `dist/native.css`                                                 |
| `@codenhub/styles/palette`      | `dist/palette.css`                                                |
| `@codenhub/styles/aesthetics`   | `dist/aesthetics/index.css`                                       |
| `@codenhub/styles/aesthetics/*` | `dist/aesthetics/<name>.css`, such as `dist/aesthetics/pixel.css` |

Link one base file, not several, since they overlap, and any aesthetics you use. Their order does not matter, because every file declares the [cascade layers](../setup.md#cascade-layers) before using one. [Setup → All entrypoints](../setup.md#all-entrypoints) explains what each one contains.

## From a CDN

jsDelivr and unpkg serve every file of every published npm version, so a page can link one with nothing installed:

```html
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.8.0/dist/index.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.8.0/dist/aesthetics/pixel.css" />
</head>
```

Put the exact version in the URL. Without one, the CDN serves the latest release, and below 1.0 a minor release may rename or remove a class; see [Versioning](../index.md#versioning).

## From your own server

Install the package, then serve its `dist/` folder as static files:

```sh
npm install @codenhub/styles
```

How a framework serves a folder from `node_modules` differs, so each one is below. Where the framework reads the folder in place, as Rails and Django do, upgrading the package and redeploying is all an update takes.

### Plain HTML

Copy `node_modules/@codenhub/styles/dist` into the folder your server publishes, then link it:

```html
<link rel="stylesheet" href="/vendor/codenhub-styles/index.css" />
```

Repeat the copy after each upgrade, for example from an npm `postinstall` script.

### Ruby on Rails

A Rails app built with `cssbundling-rails` already runs a bundler: import the package from `app/assets/stylesheets/application.css` as in [Setup → Import the stylesheet](../setup.md#import-the-stylesheet).

With Propshaft and no CSS bundler, add the package's folder to the asset paths:

```ruby
# config/initializers/assets.rb
Rails.application.config.assets.paths << Rails.root.join("node_modules/@codenhub")
```

Then link it from the layout, by its path below that folder:

```erb
<%# app/views/layouts/application.html.erb %>
<%= stylesheet_link_tag "styles/dist/index" %>
<%= stylesheet_link_tag "styles/dist/aesthetics/pixel" %>
```

Point the path at `node_modules/@codenhub` rather than at `dist/` itself. Propshaft serves files by their path below each asset folder, so adding `dist/` directly would publish a bare `index.css` that collides with any `index.css` of your own.

The files you link are in `dist/`, which holds only finished CSS, plus an empty `index.d.ts` for TypeScript. The Tailwind source lives in `tw/`, outside `dist/`, so a static pipeline that serves or fingerprints `dist/` meets no `@import` it cannot resolve.

### Django

Add the folder to `STATICFILES_DIRS` under a prefix, which keeps its file names apart from your own static files:

```python
# settings.py
STATICFILES_DIRS = [
    ("codenhub-styles", BASE_DIR / "node_modules/@codenhub/styles/dist"),
]
```

```django
{% load static %}
<link rel="stylesheet" href="{% static 'codenhub-styles/index.css' %}" />
```

Point the prefix at `dist`, not at the package folder. `dist/` holds only finished CSS, plus an empty `index.d.ts` for TypeScript that the storage copies as it is, so `collectstatic` also works with `ManifestStaticFilesStorage`, which fingerprints each file and rewrites the references inside it. The package folder also holds the Tailwind source in `tw/`, whose `@import "tailwindcss/..."` lines that storage cannot resolve.

### Laravel

A Laravel app runs Vite by default, so it has a bundler: import the package from `resources/css/app.css` as in [Setup → Import the stylesheet](../setup.md#import-the-stylesheet), and load that file with the `@vite` directive as usual.

## Build only the classes you use

The package carries a command, `codenhub-styles`, that compiles it for you. It reads your templates for class names and writes one minified stylesheet with only the StyleKit classes and Tailwind utilities they use. A page that uses one button gets a small fraction of the full stylesheet; the exact size depends on which classes you use, since each component brings the shared rules it relies on.

It needs Node.js 24 or newer on the machine that builds the CSS, whether that is your laptop, a CI job, or a deploy step. It compiles with Tailwind CSS, which the package does not install for you, so a project that only links the compiled stylesheet never downloads it. Install the three packages as development dependencies from your project root; npm creates a `package.json` if you have none, and you need no Tailwind configuration:

```sh
npm install --save-dev @codenhub/styles @tailwindcss/cli tailwindcss
```

The stylesheet the command writes is plain CSS, so the servers that serve your site need neither Node.js nor any of these packages. Run it from your project root:

```sh
npx codenhub-styles build --content "app/views/**/*.erb" --output public/stylekit.css
```

On success the command prints one line, the absolute path it wrote and the file's size in bytes:

```text
/home/you/shop/public/stylekit.css 27102 bytes
```

Link that file from your layout like any static stylesheet.

### Rails views

```sh
npx codenhub-styles build --content "app/views/**/*.erb" --content "app/helpers/**/*.rb" --output public/stylekit.css
```

```erb
<%# app/views/layouts/application.html.erb %>
<link rel="stylesheet" href="/stylekit.css" />
```

### Laravel Blade views

```sh
npx codenhub-styles build --content "resources/views/**/*.blade.php" --output public/css/stylekit.css
```

```blade
{{-- resources/views/layouts/app.blade.php --}}
<link rel="stylesheet" href="{{ asset('css/stylekit.css') }}" />
```

### Django templates

A Django project keeps templates in a project-level `templates/` folder, in each app's own `templates/` folder, or both. Give one `--content` for each place yours live, and leave out any place you do not use, since a glob that matches nothing fails the build:

```sh
npx codenhub-styles build --content "templates/**/*.html" --content "shop/templates/**/*.html" --output static/stylekit.css
```

```django
{% load static %}
<link rel="stylesheet" href="{% static 'stylekit.css' %}" />
```

Write the output into a folder listed in `STATICFILES_DIRS`, here `static/`, so `collectstatic` picks it up. The settings above list only the package's folder, so add `BASE_DIR / "static"` to that list if your project does not have it yet.

### Options

- `--content <glob>`, or `-c <glob>`, names the files to read for class names. It is required and repeatable: pass it once per glob, and the build reads every file any of them matches. A relative glob is resolved against the folder you run the command in, so run it from your project root; an absolute glob is used as given. `**` matches any number of folders, and `{rb,erb}` either extension. Any text file works, whatever its extension. Each glob has to match at least one file, or the build fails and names it, so a typo cannot ship an empty stylesheet. Files your `.gitignore` excludes are still read when a glob matches them, and nothing outside your globs is read.
- Quote every glob. Without quotes, your shell may expand the glob into a list of files before the command sees it, and only the first file counts as the `--content` value. When that leaves extra file names behind, the build rejects them rather than silently reading less than you meant; when the glob matched a single file, the build reads just that file and nothing your templates add later.
- `--output <file>`, or `-o <file>`, is the stylesheet to write. It is required. A relative path is resolved against the folder you run the command in, missing parent folders are created, and an existing file is replaced.
- `--aesthetic <name>` adds one of the [aesthetics](../usage/aesthetics.md): `neobrutalism`, `glass`, `pixel`, `chunky-tile`, `cyber`, or `sketch`. Repeat it for more than one; naming one twice includes it once. Aesthetics are opt-in because the build cannot tell from your templates which one you want, so each is written in full when you ask for it, and none is included when you do not.
- `--no-minify` writes readable, indented CSS instead. Useful for reading what the build produced; serve the minified file.
- `--help` prints the usage, with the aesthetics this version ships. `--version` prints the package version. Both build nothing and exit with status 0.

The output always holds the theme, its design tokens as CSS custom properties, the reset, and the base rules every component relies on. On top of that come each StyleKit class your templates use, with the variants you combine it with, such as `primary` or `soft`, and each Tailwind utility they use, such as `flex` or `mt-4`. The output is built from the complete stylesheet, not from `/native`, so it has no classless mappings.

### How classes are found

The build does not run your templates. It reads each file your `--content` globs match as plain text, collects every word that could be a class name, and writes the rules for the words that are StyleKit classes or Tailwind utilities. This is how Tailwind CSS reads content too.

A class has to appear in a file as one whole word. `class="btn primary"`, `class: "btn primary"`, and `classes = ["btn", "primary"]` all work. A word that only looks like a class also counts: a comment that says "card" adds the card's full rules to the stylesheet, which makes the file larger and changes nothing on the page.

A class name your code assembles while rendering never appears whole in any file, so the build cannot find it. In `class="btn <%= @order.priority %>"`, `btn` is found, but the intent is whatever `priority` holds at render time; if that is `destructive`, the button renders without its red. Two ways out:

- **Write class names whole.** Map each value to a complete class name in a file the build reads, such as `{ "urgent" => "destructive", "normal" => "neutral" }.fetch(@order.priority)` in a helper.
- **List them in a safelist file.** A plain text file with one class name per line, added with its own `--content`, such as `--content config/stylekit-classes.txt`. Keep it next to the code that builds the class names, so whoever changes one sees the other.

### What it does not do

- **No watch mode.** It builds once and exits. Run it again after you change a template, from a script, or from a file watcher your framework or editor already has. A class the stylesheet does not have yet leaves its element unstyled until the next build.
- **No configuration file and no custom CSS.** You cannot add your own `@theme` values, `@utility` definitions, or plugins. To change the look, override the custom properties in a stylesheet of your own loaded after this one, as [Customizing](../usage/customizing.md) describes. When you need Tailwind's own configuration, install Tailwind CSS and import the source entrypoint from your own Tailwind input, as [Tailwind CSS v4](./tailwind.md) shows.
- **No other commands.** `build` is the only one; `--help` and `--version` are the only flags that run without it.
- **No Tailwind version of its own.** Each build uses the `@tailwindcss/cli` and `tailwindcss` installed in your project, within the `>=4.3.2 <5` range StyleKit supports, so your lockfile pins them.

### In a deploy

Build the stylesheet before whatever step collects or fingerprints your assets, such as `rails assets:precompile`, `php artisan optimize`, or `python manage.py collectstatic`. Either commit the output, so the servers need no Node.js at all at the cost of a generated file someone has to remember to rebuild, or build it on deploy, so the build machine needs Node.js 24 or newer.

Pin the version. Below 1.0 a minor release may rename or remove a class, so the same command can write a different stylesheet with a newer version. Commit `package.json` and the lockfile npm writes, and install with `npm ci` on the build machine, so every build uses the versions you tested.

### When the build fails

Every failure prints one line starting with `codenhub-styles:` to standard error and exits with status 1, without writing the output file, so a deploy script stops instead of shipping a stale or empty stylesheet. The line says what went wrong and what to do:

- **`missing --content` or `missing --output`.** Add the one it names. An `--output` that is empty or only spaces counts as missing.
- **`--content "<glob>" matches no file in <folder>`.** Usually a typo in the path, a command run from another folder than your project root, or a glob for a place your project does not use. Building from nothing would write a stylesheet with no component classes, and the site would quietly lose its styling.
- **`unexpected argument "<file>"`.** Almost always a `--content` glob without quotes, which your shell expanded into a list of files. Quote the glob.
- **`unknown option "<flag>"`.** A typo, or an option from another tool, such as `--watch` or `--config`. `--help` lists the options.
- **`option "<flag>" is missing its value or does not take one`.** A flag that takes a value was the last thing on the line, or `--no-minify` was given one, as in `--no-minify=true`.
- **`unknown aesthetic "<name>"; choose from ...`.** Pick one of the names listed. They are lowercase and hyphenated, as in `chunky-tile`.
- **`missing command` or `unknown command "<name>"`.** The first word after `codenhub-styles` has to be `build`.
- **`this command needs @tailwindcss/cli and tailwindcss, which are not installed`.** The line names whichever of the two is missing and ends with the command that installs it. Run that from your project root.
- **`this command needs Node.js 24 or newer`.** Update Node.js on the machine that builds the CSS.
- **`Tailwind failed to build the stylesheet: <reason>`.** `<reason>` is Tailwind's own message. `EISDIR` means `--output` names an existing folder, so name a file inside it; `EACCES` or `EPERM` means you cannot write there. For any other reason, run the same command with `--no-minify` to rule out the minifier, and report the message with the version from `--version`.

## Verifying it worked

Render one styled element, as in [Integrating → Verifying it worked](./index.md#verifying-it-worked):

```html
<button class="btn primary">Save changes</button>
```

A rounded button filled with the primary color means the stylesheet loaded. If the button looks like the browser default, open the browser's network panel: a `404` on the stylesheet means the path or the static-file setup is wrong.

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. [Setup → All entrypoints](../setup.md#all-entrypoints) lists every other stylesheet you can import.
