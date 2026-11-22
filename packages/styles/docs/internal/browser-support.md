---
status: APPROVED
last_updated: 2026-11-21
scope: The browser floor `@codenhub/styles` states, and the feature behind each part of it.
---

# Browser support

## Goal

Say why the floor in [Setup → Requirements](../setup.md#requirements), Chrome 123, Safari 17.5, and Firefox 128, is where it is, and what happens in a browser at the floor when the package uses a feature that is newer still.

## The floor

Two features set it. Both carry meaning the package cannot lose, so a browser without them is below the floor rather than given a lesser page:

| Feature        | Chrome | Safari | Firefox | Why it is required                                                                                                                                                                                                                  |
| -------------- | ------ | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `light-dark()` | 123    | 17.5   | 120     | Every color token is a `light-dark()` pair. Without it, every color declaration is invalid.                                                                                                                                         |
| `@property`    | 85     | 16.4   | 128     | The plate ink, the elevation modifier, and the space toggles rely on a registered property inheriting, or not, and on an invalid declaration computing to the inherited value. Without it, nested components read the wrong values. |

The rest of what the compiled output relies on is older than the floor in every engine:

| Feature                                                   | Chrome | Safari | Firefox |
| --------------------------------------------------------- | ------ | ------ | ------- |
| `@layer`                                                  | 99     | 15.4   | 97      |
| `color-mix()`                                             | 111    | 16.2   | 113     |
| `oklch()`, `oklab()`                                      | 111    | 15.4   | 113     |
| `:where()`, `:is()`                                       | 88     | 14     | 78      |
| `:has()`                                                  | 105    | 15.4   | 121     |
| `:dir()`                                                  | 120    | 16.4   | 49      |
| `:popover-open`, `::backdrop` of a popover                | 114    | 17     | 125     |
| `::file-selector-button`                                  | 89     | 14.1   | 82      |
| `translate`, `scale`                                      | 104    | 14.1   | 72      |
| `prefers-contrast`                                        | 96     | 14.1   | 101     |
| `forced-colors`                                           | 89     | 16     | 89      |
| `backdrop-filter`, written with its `-webkit-` prefix too | 76     | 9      | 103     |
| `mask-image`, written with its `-webkit-` prefix too      | 1      | 15.4   | 53      |

## Newer than the floor

Each of these is newer than the floor in at least one engine. A browser at the floor drops the declaration or the rule and keeps the rest; none of them is in a selector list with a selector the browser accepts, so an unknown one never takes a working rule down with it.

| Feature                               | Chrome   | Safari | Firefox | Used for                                                                          | At the floor                                                                        |
| ------------------------------------- | -------- | ------ | ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `text-wrap: balance`                  | 114      | 17.5   | 121     | A button's label, when it wraps                                                   | Supported.                                                                          |
| `transition-behavior: allow-discrete` | 117      | 17.4   | 129     | The reduced-motion reset, so a popover or dialog still closes at once             | Firefox 128 ignores the longhand, and has no discrete transition to keep.           |
| `animation-timeline`                  | 115      | 26     | 159     | The reduced-motion reset, so a scroll-driven animation does not follow the scroll | Safari 17.5 and Firefox 128 have no scroll-driven animation to stop.                |
| `::details-content`                   | 131      | 18.4   | 143     | The reduced-motion reset                                                          | A rule of its own, dropped; there is no such part to animate.                       |
| `::view-transition` and its parts     | 111      | 18     | 144     | The reduced-motion reset                                                          | Rules of their own, dropped; there is no view transition to animate.                |
| `::picker(select)`                    | 135      | 27     | none    | The reduced-motion reset                                                          | A rule of its own, dropped; the picker is the native one.                           |
| `scrollbar-color`                     | 121      | 26.2   | 64      | The page's scrollbar colors                                                       | Safari 17.5 keeps its own scrollbar.                                                |
| `scrollbar-width`                     | 121      | 18.2   | 64      | A thin page scrollbar                                                             | Safari 17.5 keeps its own scrollbar.                                                |
| `corner-shape`                        | 139      | 27.3   | none    | Cyber's bevel, glass's continuous corners                                         | Cyber squares its cut corners and glass rounds them; see [model](./model.md#cyber). |
| An SVG filter in `backdrop-filter`    | Chromium | none   | none    | Glass's lens                                                                      | The pane keeps its rim, blur, and ground without the lens.                          |

Versions are the first release with unprefixed, unflagged support in MDN's [browser-compat-data](https://github.com/mdn/browser-compat-data), read on 2026-11-21, except the two rows written with their prefix, which give the prefixed support, and the SVG filter row, which is what the package's own glass tests observe. They were not measured in the browsers themselves: the browser suite runs the current release of each engine, not the floor.

## Keeping it

A feature added to `src/` that no browser at the floor supports either lands in [Newer than the floor](#newer-than-the-floor) with what happens without it, or raises the floor, in [Setup](../setup.md#requirements), [the package index](../index.md), and here, in the same change, with the row that explains it. An unknown pseudo-element or pseudo-class goes in a rule of its own, never in a list beside selectors a floor browser accepts, as the reduced-motion reset does in `src/reset.rules.css`.
