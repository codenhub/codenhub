---
title: Without a bundler
description: Linking the compiled stylesheets from plain HTML, Rails, Django, or any server-rendered app.
order: 6
---

# Without a bundler

The compiled stylesheets are finished CSS: each one is a single file with no `@import` and no reference to another file, and every image it draws is embedded as a `data:` URL. A page can load one with a plain `<link>` tag, from any server, with no build step.

What needs a build tool is the import _name_. `@import "@codenhub/styles"` names a package, and finding the file behind that name — `node_modules/@codenhub/styles/dist/index.css` — is done by Node-aware tooling such as Vite, webpack, or the Tailwind CLI, which read the package's `exports` map. A browser does not: it resolves `@import` and `href` against the page's own URL, so a bare package name becomes a request for a file that does not exist. Without a bundler, link the file by its path instead.

The `/tw` entrypoints are Tailwind source and always need a Tailwind build; this page covers the compiled ones only.

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

Link the base file first and an aesthetic after it. [Setup → Import paths](../setup.md#import-paths) explains what each one contains; link one base file, not several, since they overlap.

## From a CDN

jsDelivr and unpkg serve every file of every published npm version, so a page can link one with nothing installed:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.7.0/dist/index.css" /> <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.7.0/dist/aesthetics/pixel.css" />
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

A Rails app built with `cssbundling-rails` already runs a bundler: import the package from `app/assets/stylesheets/application.css` as in [Setup → Quick start](../setup.md#quick-start).

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

### Laravel

A Laravel app runs Vite by default, so it has a bundler: import the package from `resources/css/app.css` as in [Setup → Quick start](../setup.md#quick-start), and load that file with the `@vite` directive as usual.

## Verifying it worked

Render one styled element, as in [Integrating → Verifying it worked](./index.md#verifying-it-worked):

```html
<button class="btn primary">Continue</button>
```

A rounded, filled button in the primary color means the stylesheet loaded. If the button looks like the browser default, open the browser's network panel: a `404` on the stylesheet means the path or the static-file setup is wrong.
