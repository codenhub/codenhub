---
status: IMPLEMENTED
last_updated: 2026-07-17
scope: Repository-wide static assets under root `assets/`.
---

# Assets

This document catalogs files under `assets/` and explains how to select and
use them. Paths are relative to repository root.

`assets/` contains Coden brand artwork and bundled fonts. Coden is the agency
behind CodenHub and owns the logo, mark, and favicon artwork. Bundled fonts
remain owned by their authors and subject to their respective licenses.

## Image naming

`light` and `dark` describe image color scheme, not application theme:

- `*-light.svg` is bright artwork. Place it on a dark background.
- `*-dark.svg` is dark artwork. Place it on a bright background.

Select image from actual background behind it. Do not select solely from a
theme name or user color-scheme preference.

## Logos

Logo files are transparent SVG artwork. Preserve aspect ratio when resizing.

| File                         | Artwork                   | Dimensions | Use                                              |
| ---------------------------- | ------------------------- | ---------- | ------------------------------------------------ |
| `assets/logo/logo-light.svg` | Full bright Coden logo    | 984 x 255  | Full brand identification on dark backgrounds.   |
| `assets/logo/logo-dark.svg`  | Full dark Coden logo      | 984 x 255  | Full brand identification on bright backgrounds. |
| `assets/logo/mark-light.svg` | Compact bright Coden mark | 346 x 255  | Compact placement on dark backgrounds.           |
| `assets/logo/mark-dark.svg`  | Compact dark Coden mark   | 346 x 255  | Compact placement on bright backgrounds.         |

### Previews

Bright artwork shown on dark background:

<table>
  <tr>
    <td><img src="../assets/logo/logo-light.svg" alt="Bright Coden full logo" width="492"></td>
    <td><img src="../assets/logo/mark-light.svg" alt="Bright Coden compact mark" width="173"></td>
  </tr>
</table>

Dark artwork shown on bright background:

<table>
  <tr>
    <td><img src="../assets/logo/logo-dark.svg" alt="Dark Coden full logo" width="492"></td>
    <td><img src="../assets/logo/mark-dark.svg" alt="Dark Coden compact mark" width="173"></td>
  </tr>
</table>

Use full logo when space permits and name must remain visible. Use compact mark
when available space cannot accommodate full logo. Example:

```html
<img src="/assets/logo/logo-light.svg" alt="Coden" width="246" height="64" />
```

This URL assumes deployment exposes repository `assets/` as `/assets/`.
Otherwise, copy or import file through application's asset pipeline and use
resulting URL.

## Favicons

`favicon.ico` is default favicon. Size-specific files are alternatives for
consumers requiring explicit dimensions.

| File                             | Size    | Use                                  |
| -------------------------------- | ------- | ------------------------------------ |
| `assets/favicon/favicon.ico`     | Default | General browser favicon.             |
| `assets/favicon/favicon-32.ico`  | 32 px   | Explicit 32 x 32 icon requirement.   |
| `assets/favicon/favicon-64.ico`  | 64 px   | Explicit 64 x 64 icon requirement.   |
| `assets/favicon/favicon-128.ico` | 128 px  | Explicit 128 x 128 icon requirement. |
| `assets/favicon/favicon-256.ico` | 256 px  | Explicit 256 x 256 icon requirement. |

Default browser usage:

```html
<link rel="icon" href="/assets/favicon/favicon.ico" sizes="any" />
```

Explicit-size usage:

```html
<link rel="icon" href="/assets/favicon/favicon-32.ico" sizes="32x32" type="image/x-icon" />
```

URLs assume same `/assets/` deployment mapping described for logos.

## Fonts

Inter is body typeface. Monomaniac One is display typeface for brand and other
special text.

For web delivery, prefer WOFF2 and retain WOFF as fallback where required. TTF
files support environments or tools that require TrueType input; avoid serving
them when web formats are accepted.

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

Load upright and italic files as separate faces, then apply Inter to body text:

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

Load regular face and apply it only to display, brand, or special text:

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

URLs in font examples assume same `/assets/` deployment mapping described for
logos.

### Font licenses

Both font families use SIL Open Font License 1.1. Keep corresponding
`LICENSE.txt` with each family when bundling, embedding, or redistributing font
files. License files contain complete terms and take precedence over this
summary.
