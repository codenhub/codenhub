---
title: Content and layout
description: Layout helpers, content chips and tables, surfaces, and typography utilities.
---

# Content and layout

## Layout

Layout helpers use the shared `--layout-gap` token. `.tight` sets it to
`0.5rem` and `.loose` sets it to `1.5rem` within a view, stack, cluster, or
auto-grid.

- `.view` is a flex container; `.vertical` and `.horizontal` set its
  direction, and horizontal views wrap with centered cross-axis alignment.
- `.stack` is a vertical flex stack.
- `.cluster` is a wrapping horizontal flex row; `.between` adds
  `space-between` alignment.
- `.auto-grid` is a responsive auto-fit grid using `--layout-grid-min`.
- `.tight` and `.loose` set the shared gap to `0.5rem` or `1.5rem` on views,
  stacks, clusters, and auto-grids.
- `.section` adds responsive block padding and an inline gutter.
- `.section-content` centers content at `--container-max`; `.narrow` and
  `.wide` select the corresponding container tokens.
- `.divider` is horizontal; `.vertical` makes it self-stretch vertically. It
  takes intent, but presentation classes do not affect it.

The removed `--layout-stack-gap` and `--layout-cluster-gap` tokens have no
compatibility aliases.

## Content

| Class           | Purpose                                                                                  | Intent affects         |
| --------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| `.table-wrap`   | Full-width horizontal overflow wrapper for wide tables.                                  | Nothing.               |
| `.data-table`   | Rounded nested table styling for captions, heads, footers, cells, and rows.              | Head, border, hover.   |
| `.ruled`        | On `.data-table`. Draws a rule between body rows.                                        | Rule color.            |
| `.ruleless`     | On `.data-table`. Draws no lines inside the table at all.                                | Nothing.               |
| `.kbd`          | Inline keyboard-input styling.                                                           | Surface, border, text. |
| `.quote`        | Block quote styling; a nested `cite` is set upright and takes the quotation's own color. | Bar, surface, text.    |
| `.quote-inline` | Inline quotation styling.                                                                | Nothing.               |
| `.code`         | Inline code formatting.                                                                  | Surface.               |
| `.pre`          | Scrollable block code formatting with larger padding.                                    | Surface.               |

### Table rules

A table draws three kinds of line, and `.ruled` and `.ruleless` move all of
them together:

| Class       | Head and foot boundaries | Rules between body rows |
| ----------- | ------------------------ | ----------------------- |
| `.ruleless` | No                       | No                      |
| _no class_  | Yes                      | No                      |
| `.ruled`    | Yes                      | Yes                     |

```html
<table class="data-table">Head and foot boundaries only</table>
<table class="data-table ruled">Every row separated</table>
<table class="data-table ruleless">No lines inside the table at all</table>
```

The boundaries under a head and above a foot separate the parts of a table
from each other, so they are drawn by default where the row rules are not.
Rules between body rows used to arrive on their own, because the
component's published edge default is `edged` and the edge axis wrote the
rules along with the boundary — so whether you got them depended on a
registry default rather than on anything in your markup.

`--ui-rule` is the token behind both classes, so a container can set the
answer for a whole region without classing each table:

```html
<section style="--ui-rule: 100%">
  <table class="data-table">Ruled by the region</table>
</section>
```

The frame around the table is the edge axis and is asked for the same way:
`.data-table` publishes `edgeless`, so `.edged` draws one. None of the
three switches reaches the others — `.data-table.ruleless.edged` is a
framed table with no lines inside it, and `.data-table.ruled` is a
frameless one with every row separated.

A table's rows deliberately inherit its intent instead of resetting it, so
`.data-table.success` tints throughout. A row carrying its own intent still
wins:

```html
<table class="data-table success">
  <tbody>
    <tr>
      <td>Inherits the table intent</td>
    </tr>
    <tr class="destructive">
      <td>Overrides it for this row</td>
    </tr>
  </tbody>
</table>
```

This is the one place intent cascades, because a table's rows are parts of
the table rather than independent components.

`.data-table`, `.kbd`, `.code`, and `.pre` also read
[presentation](./composing.md#presentation). A table applies it to its
header, its rules and its border; a chip to its whole plate:

```html
<table class="data-table success soft edged">...</table>
<table class="data-table">A ghost table: rules and type, no header plate</table>
<kbd class="kbd primary solid">Ctrl</kbd>
<kbd class="kbd primary soft edged">Shift</kbd>
```

`.ghost` means two different things on these components, and both are worth
knowing before you reach for it.

On `.data-table` it removes the header plate along with the body tint, so
`.data-table.ghost` is boundaries and type alone. The component rests at
`soft`, so that is something to ask for rather than the default.

On `.kbd`, `.code`, and `.pre` it is **not supported**. All three rest on
`--intent-subtle`, and that ground draws the plate whatever the fill says —
so `.ghost` took the fill away and changed nothing visible. Worse, the
ground alone is a near-page tint: a ghost chip measured the same `#e5e5e5`
for neutral and primary on the light page, and `#f5f5f5` at 1.04:1 against
it for secondary. All three rest at `.soft` instead, which puts a real `12%`
of the intent over the ground and separates them.

Use `.table-wrap` around `.data-table` when table width may exceed its
container:

```html
<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Package</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>styles</td>
        <td>Ready</td>
      </tr>
    </tbody>
  </table>
</div>
```

## Surfaces

| Class          | Purpose                                                            |
| -------------- | ------------------------------------------------------------------ |
| `.card`        | Raised container. Bordered, surface radius, low elevation, padded. |
| `.panel`       | Flush container for sidebars, toolbars, and wells. No elevation.   |
| `.interactive` | On `.card`. Adds pointer cursor, hover lift, and a focus ring.     |
| `.compact`     | On `.card` or `.panel`. Reduces padding.                           |
| `.spacious`    | On `.card` or `.panel`. Increases padding.                         |
| `.flush`       | On `.card` or `.panel`. Removes padding, for edge-to-edge content. |

Both read intent, [presentation](./composing.md#presentation), and
[material tokens](./customizing.md#material-tokens). A plain `.card` is a
neutral bordered container; only an explicit presentation tints it.

```html
<article class="card">Neutral card</article>
<article class="card success soft">Tinted success card</article>
<article class="card primary ghost edged">Intent border, no fill</article>
<a class="card interactive" href="/package">Lifts on hover</a>
<aside class="panel">Flush panel</aside>
```

`.interactive` is styling only. Use a real interactive element and give it
an accessible name; a `<div class="card interactive">` is not focusable or
operable by keyboard.

## Typography utilities

All typography classes and `.selection-contrast` are `@utility` classes.

| Class                 | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `.text-display`       | Large display headings.                                      |
| `.text-title-lg`      | Large section titles.                                        |
| `.text-title`         | Default section titles.                                      |
| `.text-title-sm`      | Smaller titles or card titles.                               |
| `.text-label-lg`      | Large label text.                                            |
| `.text-label`         | Default label text.                                          |
| `.text-body`          | Default body copy.                                           |
| `.selection-contrast` | Inverts `::selection` colors to primary-contrast background. |
