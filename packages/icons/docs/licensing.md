---
title: Licensing
description: What each build owes for the artwork it ships, the attribution modes, and how the notice travels per delivery method.
order: 5
---

# Licensing and attribution

This page explains what your build owes for the icon artwork it ships, how the `attribution` option works, how each delivery method carries the required notice, and what trademark constraints apply to brand icons.

Every bundled, generated family ships the license text and attribution notice its artwork requires; those files travel with the package regardless of what a build outputs. A third-party set adopted through `adoptIconifySet` is not covered by that guarantee — supply its license and attribution material yourself.

## Attribution modes

The `attribution` option controls how license notices reach your build output:

| Mode             | Behavior                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (default) | Prepends a `/*! … */` banner to the generated CSS, naming only the families the build used. Vite's inline SVG mode, which has no stylesheet, emits `icons-attribution.txt` instead. |
| `file`           | Emits `icons-attribution.txt` as a build asset instead. Vite only.                                                                                                                  |
| `off`            | Emits nothing, and warns when a family used still requires a notice.                                                                                                                |

## How the notice travels

Each delivery method carries the notice through a mechanism that its pipeline supports:

| Method             | How the notice travels                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Vite               | A `/*! … */` banner on the generated CSS, or `icons-attribution.txt` under `file` and in inline SVG mode. |
| PostCSS            | A `/*! … */` banner on the generated CSS.                                                                 |
| Tailwind `/tw`     | A `/*! … */` banner opening `dist/tw/index.css`, naming every family it resolves.                         |
| Tailwind `@plugin` | A `--ic-attribution-<family>` custom property on `:root`, one per family the build used.                  |
| Plain CSS          | A `/*! … */` banner opening each family stylesheet you imported.                                          |

`@import "@codenhub/icons/tw"` inlines a static file, so it carries an ordinary `/*! … */` banner. Because that file makes every bundled family resolvable except brand families, the banner names all of those core families — a superset notice, which satisfies the license requirement safely. Declaring the plugin yourself with `@plugin "@codenhub/icons/tailwind"` narrows resolution, and there the notice is emitted as a `--ic-attribution-<family>` custom property instead: Tailwind's plugin API generates CSS declarations rather than comments, and the property is emitted the first time a family produces a utility, so the output carries notices only for the artwork it actually shipped.

## Obligation levels

Permissive licenses still carry different distribution requirements, grouped into three levels:

- **`none`** — public-domain dedications. Nothing is owed in distributed output.
- **`notice`** — MIT, ISC, and Apache-2.0. The copyright and license notice must accompany distributed output, which `auto` and `file` handle automatically.
- **`credit`** — CC-BY and similar licenses. The author must be credited visibly.

Every bundled family except `simple-icons` and `logos` belongs to the `core` tier, meaning its obligation level is `none` or `notice`, so a default build satisfies its license terms automatically. Note that a minifier configured with `legalComments: "none"` strips CSS comments, including `/*! … */` banners; use `attribution: "file"` in Vite, or preserve legal comments in your minifier config.

A set adopted through `adoptIconifySet` belongs to the `extended` tier — you remain responsible for complying with its license terms and providing its attribution material. See [JavaScript API](javascript-api.md).

## Brand families

`simple-icons` and `logos` belong to the `brand` tier: one-color logos from [Simple Icons](https://simpleicons.org) and full-color logos from [gilbarbara/logos](https://github.com/gilbarbara/logos), both dedicated to the public domain under CC0. Neither family owes a license notice, but a logo is a trademark, and the trademark is separate from the copyright license: using a mark remains subject to its owner's brand guidelines, which no build option can satisfy or verify.

- **Opt-in only.** Vite and PostCSS load only the families you pass. `@codenhub/icons/tw` never resolves brand families; a declared `@plugin "@codenhub/icons/tailwind"` resolves them only when its `families` option names them.
- **Trademark notice line.** Each family's notice line, wherever the build emits one, states that the marks are trademarks of their owners. Setting `attribution: "off"` suppresses it without a warning because no license requires it.
- **Excluded Simple Icons entries.** Simple Icons records a separate license for some icons. Icons whose own license adds any obligation are excluded, so no icon in the family carries a recorded license obligation: each is CC0, Unlicense, or has no license recorded upstream.
- **Recoloring and guidelines.** Each brand icon renders in its brand colors by default, and `--ic-color` can recolor it; a full-color logo becomes a monochrome silhouette. Owners' guidelines commonly permit a mark in its official colors or plain monochrome and restrict arbitrary colors; check the owner's terms when recoloring a mark. See [Color](concepts.md#color).
- **Simple Icons removals.** Simple Icons removes icons when brand owners request it. Upgrading the package across an upstream major version can remove icon names; check the changelog for removed names.
- **Pinned `logos` source.** gilbarbara/logos publishes no releases, so `logos` is generated from a pinned commit, and upgrading it can remove or rename logos; check the changelog for changes. A few upstream files whose markup cannot render as a self-contained icon, such as files embedding a bitmap, are excluded, and the family's `ATTRIBUTION.md` lists them.

## Next

Read [Troubleshooting](troubleshooting.md) if an icon fails to appear, renders as a solid square, ignores stroke width, or drops its license notice.
