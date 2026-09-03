---
title: Licensing
description: What each build owes for the artwork it ships, the attribution modes, and how the notice travels per delivery method.
---

# Licensing and attribution

Every bundled, generated family ships the license text and attribution notice its artwork requires; those files travel with the package whatever a build does. A third-party set adopted through `adoptIconifySet` is not covered by that promise — bring your own licensing material for it.

## Attribution modes

What reaches your own output is the `attribution` option:

| Mode             | Behavior                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `auto` (default) | Prepends a `/*! … */` banner to the generated CSS, naming only the families the build used. |
| `file`           | Emits `icons-attribution.txt` as a build asset instead. Vite only.                          |
| `off`            | Emits nothing, and warns when a family used still requires a notice.                        |

## How the notice travels

The vehicle differs by delivery method, because not every method can carry a comment:

| Method             | How the notice travels                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Vite               | A `/*! … */` banner on the generated CSS, or `icons-attribution.txt` under `file`.       |
| PostCSS            | A `/*! … */` banner on the generated CSS.                                                |
| Tailwind `/tw`     | A `/*! … */` banner opening `dist/tw/index.css`, naming every bundled family.            |
| Tailwind `@plugin` | A `--ic-attribution-<family>` custom property on `:root`, one per family the build used. |
| Plain CSS          | A `/*! … */` banner opening each family stylesheet you imported.                         |

`@import "@codenhub/icons/tw"` inlines a static file, so it carries an ordinary `/*! … */` banner. That file makes every bundled family resolvable, so the banner names them all — a superset notice, which is always safe. Declaring the plugin yourself with `@plugin "@codenhub/icons/tailwind"` narrows resolution, and there the notice is a `--ic-attribution-<family>` custom property instead: Tailwind's plugin API builds declarations, not comments, and the property is emitted the first time a family produces a utility, so the output carries notices for the artwork it actually shipped and no other.

## Obligation levels

Obligations come in three levels, because permissive is not the same as free of obligation:

- `none` — public-domain dedications. Nothing is owed.
- `notice` — MIT, ISC, Apache-2.0. The notice must travel with distributed output, which `auto` and `file` handle for you.
- `credit` — CC-BY and similar. The author must be credited visibly.

Every bundled family is `core` tier, meaning `none` or `notice`, so a default build satisfies every obligation automatically. A minifier configured with `legalComments: "none"` strips CSS comments, which is what `file` mode exists for.

A set adopted through `adoptIconifySet` is `extended` tier — you remain responsible for its license terms and attribution material. See [JavaScript API](javascript-api.md).
