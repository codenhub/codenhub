---
status: IMPLEMENTED
last_updated: 2026-11-01
scope: Repository-wide static assets under root `assets/`.
---

# Assets

This document catalogs the files under `assets/` and explains how to select and use them. Paths are relative to the repository root.

`assets/` contains Coden brand artwork and bundled fonts. Coden is the agency behind CodenHub and owns the logo, mark, favicon, icon, social, and motion artwork. Bundled fonts remain owned by their authors and subject to their respective licenses. The rules for using the artwork, such as clear space, minimum sizes, and colors, are in [`guidelines/identity.md`](guidelines/identity.md).

## Image naming

`light` and `dark` describe the image's color scheme, not the application theme:

- `*-light.svg` is bright artwork. Place it on a dark background.
- `*-dark.svg` is dark artwork. Place it on a bright background.

Select an image from the actual background behind it. Do not select it solely from a theme name or the user's color-scheme preference.

## Logos

Logo files are transparent SVG artwork made only of filled paths, with no live text or styles. Preserve the aspect ratio when resizing. The two-tone files draw the brackets in grey; the one-color files draw the whole logo in one color, for single-ink print, engraving, and embroidery.

| File                              | Artwork                             | Dimensions  | Use                                              |
| --------------------------------- | ----------------------------------- | ----------- | ------------------------------------------------ |
| `assets/logo/logo-light.svg`      | Full bright Coden logo, two-tone    | 978.6 x 255 | Full brand identification on dark backgrounds.   |
| `assets/logo/logo-dark.svg`       | Full dark Coden logo, two-tone      | 978.6 x 255 | Full brand identification on bright backgrounds. |
| `assets/logo/mark-light.svg`      | Compact bright Coden mark, two-tone | 345.5 x 255 | Compact placement on dark backgrounds.           |
| `assets/logo/mark-dark.svg`       | Compact dark Coden mark, two-tone   | 345.5 x 255 | Compact placement on bright backgrounds.         |
| `assets/logo/logo-mono-light.svg` | Full Coden logo, white only         | 978.6 x 255 | One-color use on dark backgrounds.               |
| `assets/logo/logo-mono-dark.svg`  | Full Coden logo, black only         | 978.6 x 255 | One-color use on bright backgrounds.             |
| `assets/logo/mark-mono-light.svg` | Compact Coden mark, white only      | 345.5 x 255 | One-color compact use on dark backgrounds.       |
| `assets/logo/mark-mono-dark.svg`  | Compact Coden mark, black only      | 345.5 x 255 | One-color compact use on bright backgrounds.     |

### Previews

Bright artwork shown on a dark background:

<table>
  <tr>
    <td><img src="../assets/logo/logo-light.svg" alt="Bright Coden full logo" width="492"></td>
    <td><img src="../assets/logo/mark-light.svg" alt="Bright Coden compact mark" width="173"></td>
  </tr>
</table>

Dark artwork shown on a bright background:

<table>
  <tr>
    <td><img src="../assets/logo/logo-dark.svg" alt="Dark Coden full logo" width="492"></td>
    <td><img src="../assets/logo/mark-dark.svg" alt="Dark Coden compact mark" width="173"></td>
  </tr>
</table>

Use the full logo when space permits and the name must remain visible. Use the compact mark when the available space cannot accommodate the full logo. For example:

```html
<img src="/assets/logo/logo-light.svg" alt="Coden" width="246" height="64" />
```

This URL assumes a consumer placed the file at `/assets/logo/logo-light.svg` in its own deployment, which is a placement choice that consumer makes, not something this document assumes. `docs/specs/packages-demo.md`'s "Assets boundary" section and `docs/tooling.md`'s `hub assets` describe how a package declares which files it needs and exactly where they go.

## Favicons

Every favicon is the mark on a black squircle tile. `favicon.ico` is the default favicon and contains 16, 32, and 48 px images. `favicon.svg` scales to any size, for browsers that accept SVG icons. The size-specific files are alternatives for consumers that require explicit dimensions.

| File                             | Size          | Use                                  |
| -------------------------------- | ------------- | ------------------------------------ |
| `assets/favicon/favicon.ico`     | 16, 32, 48 px | General browser favicon.             |
| `assets/favicon/favicon.svg`     | Scalable      | Browsers that accept SVG favicons.   |
| `assets/favicon/favicon-32.ico`  | 32 px         | Explicit 32 x 32 icon requirement.   |
| `assets/favicon/favicon-64.ico`  | 64 px         | Explicit 64 x 64 icon requirement.   |
| `assets/favicon/favicon-128.ico` | 128 px        | Explicit 128 x 128 icon requirement. |
| `assets/favicon/favicon-256.ico` | 256 px        | Explicit 256 x 256 icon requirement. |

`favicon.ico` needs no `<link>` tag when a consumer places it at its own serving root — browsers probe `/favicon.ico` at the origin root by default, which is what every deployed surface in this repository does (`docs/specs/packages-demo.md`, "Assets boundary"). Reach for an explicit `<link>` only for a specific non-default size:

```html
<link rel="icon" href="/assets/favicon/favicon-32.ico" sizes="32x32" type="image/x-icon" />
```

To offer the SVG icon with the ICO as fallback, list both:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32" /> <link rel="icon" href="/assets/favicon/favicon.svg" type="image/svg+xml" />
```

The URL depends on where the consuming package places the file, the same as for logos above.

## App icons

| File                                    | Size      | Shape                    | Use                                                                           |
| --------------------------------------- | --------- | ------------------------ | ----------------------------------------------------------------------------- |
| `assets/app-icon/apple-touch-icon.png`  | 180 x 180 | Full black square        | iOS home screen; iOS rounds the corners itself.                               |
| `assets/app-icon/icon-192.png`          | 192 x 192 | Squircle on transparency | Web app manifest, `purpose: "any"`.                                           |
| `assets/app-icon/icon-512.png`          | 512 x 512 | Squircle on transparency | Web app manifest, `purpose: "any"`, and install prompts.                      |
| `assets/app-icon/icon-maskable-512.png` | 512 x 512 | Full black square        | Web app manifest, `purpose: "maskable"`; the mark stays inside the safe zone. |
| `assets/app-icon/icon.svg`              | Scalable  | Squircle on transparency | Source for other sizes.                                                       |

```html
<link rel="apple-touch-icon" href="/assets/app-icon/apple-touch-icon.png" />
```

In a web app manifest:

```json
{
  "icons": [
    { "src": "/assets/app-icon/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/assets/app-icon/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/assets/app-icon/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Social images

| File                                | Size        | Use                                                        |
| ----------------------------------- | ----------- | ---------------------------------------------------------- |
| `assets/social/avatar.png`          | 1024 x 1024 | Profile picture by default: bright mark on black.          |
| `assets/social/avatar-light.png`    | 1024 x 1024 | Profile picture where a white avatar reads better.         |
| `assets/social/og-image.png`        | 1200 x 630  | Default Open Graph and Twitter card image for Coden pages. |
| `assets/social/banner-linkedin.png` | 1584 x 396  | LinkedIn page cover.                                       |
| `assets/social/banner-x.png`        | 1500 x 500  | X profile header.                                          |

The avatars keep the mark inside the circle platforms crop to, and the banners keep the logo centered, away from the corner where platforms place the profile picture.

## Motion

The animated SVGs play from CSS inside the file, so they work in an `<img>` tag without script, and they honor `prefers-reduced-motion`.

| File                                 | Dimensions  | Behavior                                        | Use                                   |
| ------------------------------------ | ----------- | ----------------------------------------------- | ------------------------------------- |
| `assets/motion/logo-intro-light.svg` | 978.6 x 255 | Plays once in about 1.1 s, then holds the logo. | Splash screens on dark backgrounds.   |
| `assets/motion/logo-intro-dark.svg`  | 978.6 x 255 | Plays once in about 1.1 s, then holds the logo. | Splash screens on bright backgrounds. |
| `assets/motion/loader-light.svg`     | 405.5 x 255 | Loops every 1.4 s.                              | Loading states on dark backgrounds.   |
| `assets/motion/loader-dark.svg`      | 405.5 x 255 | Loops every 1.4 s.                              | Loading states on bright backgrounds. |

The intro replays each time its `<img>` is inserted into the page. A loader image does not announce anything by itself, so give it an accessible name and pair it with a status message in text where the wait matters:

```html
<img src="/assets/motion/loader-dark.svg" alt="Loading" width="64" height="40" />
```

## Fonts

Inter is the body typeface. Monomaniac One is the display typeface for brand and other special text.

For web delivery, prefer WOFF2 and retain WOFF as fallback where required. TTF files support environments or tools that require TrueType input; avoid serving them when web formats are accepted.

### Inter

| File                                             | Style   | Format |
| ------------------------------------------------ | ------- | ------ |
| `assets/fonts/inter/Inter-Variable.woff2`        | Upright | WOFF2  |
| `assets/fonts/inter/Inter-Variable.woff`         | Upright | WOFF   |
| `assets/fonts/inter/Inter-Variable.ttf`          | Upright | TTF    |
| `assets/fonts/inter/Inter-Italic-Variable.woff2` | Italic  | WOFF2  |
| `assets/fonts/inter/Inter-Italic-Variable.woff`  | Italic  | WOFF   |
| `assets/fonts/inter/Inter-Italic-Variable.ttf`   | Italic  | TTF    |
| `assets/fonts/inter/LICENSE.txt`                 | License | Text   |

Load the upright and italic files as separate faces, then apply Inter to body text:

```css
@font-face {
  font-family: "Inter";
  src:
    url("/assets/fonts/inter/Inter-Variable.woff2") format("woff2"),
    url("/assets/fonts/inter/Inter-Variable.woff") format("woff");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src:
    url("/assets/fonts/inter/Inter-Italic-Variable.woff2") format("woff2"),
    url("/assets/fonts/inter/Inter-Italic-Variable.woff") format("woff");
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
}

body {
  font-family: "Inter", sans-serif;
}
```

### Monomaniac One

| File                                                      | Style   | Format |
| --------------------------------------------------------- | ------- | ------ |
| `assets/fonts/monomaniac-one/MonomaniacOne-Regular.woff2` | Regular | WOFF2  |
| `assets/fonts/monomaniac-one/MonomaniacOne-Regular.woff`  | Regular | WOFF   |
| `assets/fonts/monomaniac-one/MonomaniacOne-Regular.ttf`   | Regular | TTF    |
| `assets/fonts/monomaniac-one/LICENSE.txt`                 | License | Text   |

Load the regular face and apply it only to display, brand, or special text:

```css
@font-face {
  font-family: "Monomaniac One";
  src:
    url("/assets/fonts/monomaniac-one/MonomaniacOne-Regular.woff2") format("woff2"),
    url("/assets/fonts/monomaniac-one/MonomaniacOne-Regular.woff") format("woff");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

.brand-text,
.display-text {
  font-family: "Monomaniac One", sans-serif;
}
```

The URLs in the font examples assume the same consumer-chosen placement described for logos.

### Font licenses

Both font families use the SIL Open Font License 1.1. Keep the corresponding `LICENSE.txt` with each family when bundling, embedding, or redistributing the font files. The license files contain the complete terms and take precedence over this summary.
