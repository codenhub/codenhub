---
status: IMPLEMENTED
last_updated: 2026-11-01
scope: Coden's visual identity — logo, color, typography, iconography, graphic elements, motion, and print applications.
---

# Visual identity

This document records how Coden looks and why: which logo version to use where, the color values, the typefaces, the graphic devices, the motion, and the rules for printed material. The files themselves are cataloged in [`docs/assets.md`](../assets.md); how the name is written and how packages are titled is in [`branding.md`](branding.md); how Coden sounds is in [`voice.md`](voice.md).

## The idea

The logo reads `code[n]`: the word "code" followed by an index in brackets. The `[n]` can be read as a function argument, an array element, or "code of n", where n is anything a client needs. It is also a wordplay on _mugen_ (無限), Japanese for "infinite": code + mugen, coden. Everything in the identity comes back to that bracket: it is the logo's one distinctive shape, the source of the graphic devices, and the subject of the motion.

The identity is monochrome on purpose. Color is reserved for the work Coden ships for clients; Coden's own material stays black, white, and grey, so the bracket tone is the only accent.

## Logo

### Versions

| Version   | Files                                                                | Use                                                                                                          |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Two-tone  | `logo-dark.svg`, `logo-light.svg`, `mark-dark.svg`, `mark-light.svg` | Default everywhere color is reproduced faithfully: screens, full-color print.                                |
| One-color | `logo-mono-*.svg`, `mark-mono-*.svg`                                 | Single-ink print, foil, embossing, engraving, embroidery, screen-printed merch, and stamps.                  |
| Tile      | `favicon/favicon.svg`, `app-icon/*`                                  | The mark on an ink squircle, for favicons, app icons, and avatars. Never place the tile on a page as a logo. |

`dark` and `light` describe the artwork, as in `docs/assets.md`: `*-dark` is dark artwork for bright grounds, `*-light` is bright artwork for dark grounds. Use the full logo when there is room for it and the name has to be read; use the mark when the space is square or smaller than the logo's minimum size.

### Construction

- The letters "code" and "n" are Monomaniac One, outlined, at an x-height of 195 units on a 255-unit height. The brackets are custom-drawn and exactly as tall as the ascender of the "d".
- Tracking is −18.56/1000 em, which gives a 23.5-unit gap between letters. Two optical adjustments correct the open counters of "c" and "e": c–o is tightened by a further 10.6/1000 em (−4 units), and the gap from "e" to "[" is 20.5 units instead of 23.5. The `[n]` group keeps its original spacing (23.5 units left of the n, 22.5 right). These were reviewed at 600, 120, 80, and 60 px wide.
- The files contain only paths with fill attributes, without `<style>` or classes, so they render the same in every tool and do not leak styles when inlined into an HTML page.

### Clear space and minimum size

- Clear space on every side equals the width of one bracket, 81.5 units, which is a third of the logo's height. Nothing else, including the edge of the page, enters that space.
- Minimum size: the full logo at 80 px or 20 mm wide; the mark at 16 px or 5 mm wide. Below that, use the mark, or the tile for icons.

### Misuse

Do not:

- retype the name in Monomaniac One or any other font: always place a logo file;
- recolor the brackets to anything but the approved tone, or give the letters the bracket tone;
- use the two-tone logo where the bracket tone cannot be reproduced, such as one-ink print or embroidery: use the one-color version;
- stretch, rotate, outline, or add shadows or gradients;
- place the logo on a photograph or pattern where the brackets lose contrast;
- capitalize it: the logo is always `code[n]`, even where the name is written "Coden" in text.

## Color

All colors are achromatic, written as `oklch(L 0 0)`, and named by their OKLCH lightness, so a token says where it sits on the scale. Hex and RGB are derived from the OKLCH value. CMYK values are starting points for a printer to confirm, never final values.

| Token     | OKLCH             | Hex       | RGB           | Print starting point                              | Role                                                                            |
| --------- | ----------------- | --------- | ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ink`     | `oklch(0 0 0)`    | `#000000` | 0, 0, 0       | K100; rich black C60 M40 Y40 K100 for large areas | Logo letters on bright grounds, text on bright grounds, print and tile grounds. |
| `gray-15` | `oklch(0.15 0 0)` | `#0b0b0b` | 11, 11, 11    | —                                                 | Dark screen ground, softer than pure black for long reading.                    |
| `gray-22` | `oklch(0.22 0 0)` | `#1b1b1b` | 27, 27, 27    | K90                                               | Raised dark surfaces; the bracket crop on dark grounds.                         |
| `gray-30` | `oklch(0.3 0 0)`  | `#2e2e2e` | 46, 46, 46    | K85                                               | Borders and dividers on dark grounds.                                           |
| `gray-46` | `oklch(0.46 0 0)` | `#585858` | 88, 88, 88    | K75                                               | Logo brackets on dark grounds.                                                  |
| `gray-54` | `oklch(0.54 0 0)` | `#6f6f6f` | 111, 111, 111 | K65                                               | Secondary text on bright grounds.                                               |
| `gray-70` | `oklch(0.7 0 0)`  | `#9e9e9e` | 158, 158, 158 | K45                                               | Logo brackets on bright grounds; secondary text on dark grounds.                |
| `gray-84` | `oklch(0.84 0 0)` | `#cacaca` | 202, 202, 202 | K25                                               | Disabled and decorative strokes on bright grounds.                              |
| `gray-92` | `oklch(0.92 0 0)` | `#e4e4e4` | 228, 228, 228 | K12                                               | Borders and dividers on bright grounds.                                         |
| `gray-97` | `oklch(0.97 0 0)` | `#f5f5f5` | 245, 245, 245 | —                                                 | Bright raised surfaces.                                                         |
| `paper`   | `oklch(1 0 0)`    | `#ffffff` | 255, 255, 255 | Unprinted stock                                   | Logo letters on dark grounds, bright grounds, text on dark grounds.             |

Proportion: on any layout, ink and paper cover almost all of the surface, about 90 percent between them; the greys are for text hierarchy and the bracket tone. A layout where grey is the dominant color no longer reads as Coden.

### Approved pairings

Contrast ratios per WCAG 2.2. The logo is exempt as a logotype; its bracket tones are listed for reference.

| Foreground | Background | Ratio   | Approved for                      |
| ---------- | ---------- | ------- | --------------------------------- |
| `ink`      | `paper`    | 21.00:1 | All text                          |
| `ink`      | `gray-97`  | 19.26:1 | All text                          |
| `gray-54`  | `paper`    | 5.02:1  | Body and secondary text           |
| `gray-54`  | `gray-97`  | 4.61:1  | Body and secondary text           |
| `paper`    | `ink`      | 21.00:1 | All text                          |
| `paper`    | `gray-15`  | 19.68:1 | All text                          |
| `gray-70`  | `gray-15`  | 7.35:1  | Body and secondary text           |
| `gray-70`  | `gray-22`  | 6.43:1  | Body and secondary text           |
| `gray-54`  | `gray-15`  | 3.92:1  | Large text and UI components only |
| `gray-70`  | `paper`    | 2.68:1  | Logo brackets and decoration only |
| `gray-46`  | `ink`      | 2.95:1  | Logo brackets and decoration only |

### Why these values

The brackets were `#d4d4d4` on `#fafafa` (1.4:1) and `#404040` on `#0a0a0a` (1.9:1), and nearly disappeared at favicon size and in light print. The new tones keep the two-tone idea at 2.7:1 and 3:1. The scale replaces Tailwind's default neutral values, which the earlier files used unchanged, with a scale defined in OKLCH, where equal steps in lightness look like equal steps to the eye. The logo uses pure black and white because they reproduce exactly on screens, in single-ink print, and in foil.

Rejected: a slightly cool "ink" scale and a slightly warm "graphite" scale were compared; the tint was barely visible on screen and would drift in print, so the scale stays achromatic. A one-color logo with outlined brackets was tried; the thin outline breaks up below 32 px, so the one-color version uses solid brackets.

## Typography

| Family         | Role                                                                                                  | License     | Fallback                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| Monomaniac One | Display: large headlines, merch lines, the bracket slot. Never body text, never under 18 px or 12 pt. | SIL OFL 1.1 | None. Where it is unavailable, set the line in Inter Semibold. |
| Inter          | Everything else: interface, body, documents, captions, contact details.                               | SIL OFL 1.1 | Segoe UI, then Arial or Helvetica.                             |

Both are bundled under `assets/fonts/` and both licenses allow web, app, print, video, and office use. Monomaniac One is a Google Font, so anyone writing a document can install it from Google Fonts.

Type scale for screens:

| Level   | Family         | Size / line height | Weight |
| ------- | -------------- | ------------------ | ------ |
| Display | Monomaniac One | 48 / 1.0           | 400    |
| H1      | Inter          | 36 / 1.15          | 600    |
| H2      | Inter          | 24 / 1.25          | 600    |
| Body    | Inter          | 16 / 1.55          | 400    |
| Small   | Inter          | 13 / 1.4           | 500    |

Why Monomaniac One stays: its rounded, squared letters give the logo its recognition, and the obvious alternatives (JetBrains Mono, IBM Plex Mono, Martian Mono) put Coden among the monospaced logos most developer tools already use. Unbounded was the strongest alternative for a more premium feel; it was rejected because it would give up the recognition the logo already has.

## Iconography

Use Phosphor Bold, which ships in `packages/icons` as `phosphor-bold`. Its rounded terminals and even stroke match Monomaniac One. Use one family per layout, at the size of the text it sits beside, in the text's color. Phosphor is MIT-licensed; the notice in `packages/icons/data/phosphor-bold/LICENSE` applies when the icons are redistributed.

## Graphic elements

- **The bracket crop.** One or two of the logo's own brackets, enlarged and placed at the edge of the layout so the edge or the frame cuts them, in one tone away from the ground: `gray-22` on ink, `gray-70` on paper. Take the bracket shape from the logo files; never use a font's bracket glyph. Do not rotate it or show both brackets and the logo at the same size. Used on the social banners and the Open Graph image.
- **The slot.** In a display line set in Monomaniac One, one word inside brackets in the bracket tone, standing for the part that changes, as in `code[n]++`. At most one slot per layout.

## Motion

Motion is quick and exact, with one moment of play: the n landing in its brackets. Durations stay between 120 and 400 ms per element; easing decelerates (`cubic-bezier(.2,.8,.2,1)`), and only the n's drop overshoots. Every animation honors `prefers-reduced-motion`: the intro shows the final logo at once, and the loader keeps only a slow fade so it still shows activity.

| File                      | Behavior                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `motion/logo-intro-*.svg` | Plays once in 1.1 s: "code" is typed letter by letter, the brackets open as an empty `[ ]`, the n drops into place. For splash screens and video openings. |
| `motion/loader-*.svg`     | Loops every 1.4 s: the brackets breathe outward while the n dims, a variable waiting for its value. For loading states.                                    |

The animations are CSS inside the SVG, so they play in an `<img>` tag, need no script, and use class names prefixed `ci-` and `cl-` so they do not collide when inlined.

## Print applications

Print files are exported as RGB PDFs, and Chromium rounds their page size to within 0.1 mm. Ask the printer to convert them to their CMYK profile, with rich black for large black areas and K100 for text, and to proof the bracket greys, which shift most between presses. Print files with personal details, such as business cards, are kept in Coden's private brand kit, not in this repository.

### Merchandise

Use the one-color files for anything printed in one ink, engraved, or embroidered: `mono-light` on dark products, `mono-dark` on light products. The two-tone files are for full-color processes such as sublimation. Fit artwork to each vendor's own template; the brand kit carries artwork at common sizes, not templates.
