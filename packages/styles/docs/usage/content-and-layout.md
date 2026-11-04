---
title: Content and layout
description: Lookup for every layout helper with its spacing, the type scale with its sizes, cards and panels with their padding, tables, quotes, code, and keyboard keys.
order: 10
---

# Content and layout

This is a lookup page for the classes that arrange a page and set its content: layout helpers, the type scale, cards and panels, tables, and the small content chips. [Building a screen](../concepts.md#lay-out-the-page) shows them in use.

## Layout

Every layout helper's gap is `--layout-gap`, `1rem` by default. Setting `--layout-gap` on an element changes the gap of every layout inside it. `.tight` and `.loose` change only the layout they are on; a layout nested inside keeps its own gap.

| Class              | Layout                                                                                                         | Gap                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `.stack`           | A vertical column.                                                                                             | `--layout-gap`, `.tight` 0.5rem, `.loose` 1.5rem |
| `.cluster`         | A row that wraps, with items centered vertically. `.between` spreads the items to both ends.                   | Same                                             |
| `.view`            | A flex container. `.vertical` makes it a column; `.horizontal` a wrapping row with items centered.             | Same                                             |
| `.auto-grid`       | A grid of equal columns, each at least `--layout-grid-min` (16rem) wide, as many as fit.                       | Same                                             |
| `.section`         | Padding around a page section: `--layout-gutter` at the sides, `--layout-section-block` at the top and bottom. | None                                             |
| `.section-content` | Centers its content at a width of `--container-max` (80rem). `.narrow` uses 48rem, `.wide` 90rem.              | None                                             |
| `.divider`         | A horizontal line, as wide as its container. `.vertical` makes it a vertical line as tall as the row.          | None                                             |
| `.visually-hidden` | Hides content on screen and keeps it for screen readers.                                                       | None                                             |

`.auto-grid` fits two 16rem columns once its container is 32rem plus the gap wide, three at 48rem plus two gaps, and so on. Below one column's width, the column shrinks to fit. Set `--layout-grid-min` on the grid to change the column width.

`--layout-gutter` is `clamp(1rem, 4vw, 2rem)` and `--layout-section-block` is `clamp(4rem, 9vw, 7rem)`: both grow with the window between those bounds. The full list of foundation tokens is in [Theming → Foundation tokens](./theming.md#foundation-tokens).

A `.divider` takes an intent, which colors it, and ignores presentation classes, so a `.ghost.edgeless` container does not hide the dividers inside it. Its width is the aesthetic's border width.

`.visually-hidden` is not named `.sr-only` because Tailwind ships a `.sr-only` of its own, and two classes with one name would conflict.

## Typography

| Class            | Size                          | Weight   | Letter spacing |
| ---------------- | ----------------------------- | -------- | -------------- |
| `.text-display`  | 3.75rem, 6rem from 48rem wide | Bold     | Tight          |
| `.text-title-lg` | 3rem, 3.75rem from 48rem wide | Bold     | Tight          |
| `.text-title`    | 1.875rem                      | Bold     | Tight          |
| `.text-title-sm` | 1.25rem                       | Semibold | Tight          |
| `.text-label-lg` | 1.125rem                      | Medium   | Wide           |
| `.text-label`    | 1rem                          | Medium   | Wide           |
| `.text-body`     | 0.875rem                      | Normal   | Wider          |

The two largest sizes grow at Tailwind's `md` breakpoint, 48rem by default. With the Tailwind source entrypoints, your own `md` breakpoint applies. The package sets no size on unclassed text: body text and unclassed headings take the browser's size, or the surrounding text size under the reset; see [Setup → Classless HTML](../setup.md#classless-html) for the classless mapping.

`.text-body` is 0.875rem, smaller than the 1rem page text; use it for secondary or dense copy, not for the page's main text.

`.selection-contrast` on an element swaps the colors of selected text inside it to `--color-primary` on `--color-primary-contrast`. Use it on a `.solid.primary` area, where the default selection color would match the background.

## Surfaces

`.card` and `.panel` are the two containers. Both take intent, [presentation](./composing.md#presentation), and [material tokens](./customizing.md#material-tokens).

| Class    | Default look                                                                | Padding by default |
| -------- | --------------------------------------------------------------------------- | ------------------ |
| `.card`  | No fill, a border, the surface corner, and a resting elevation of 1.        | 1.25rem            |
| `.panel` | The quiet background tone, no border, the surface corner, and no elevation. | 1rem               |

A resting elevation of 1 shows no shadow by itself. A card has a shadow only under an [aesthetic](./aesthetics.md) that draws depth, or with `.raised` or `.floating`; see [Composing → Elevation](./composing.md#elevation).

Padding classes:

| Class    | On `.card` | On `.panel` |
| -------- | ---------- | ----------- |
| `.p-xs`  | 0.5rem     | 0.25rem     |
| `.p-sm`  | 0.75rem    | 0.5rem      |
| _none_   | 1.25rem    | 1rem        |
| `.p-lg`  | 2rem       | 1.5rem      |
| `.flush` | 0          | 0           |

`.flush` is for content that runs edge to edge, such as an image or a table inside a card.

A panel is for sidebars, toolbars, and wells: areas that are part of the page, not objects on it. A card is a self-contained object, such as the profile card or the plan card on the settings screen.

### Neutral cards and panels

A neutral `.card.soft` and a neutral `.panel` show no tint. They use `--color-foreground`, the quiet background tone one step off the page, so they read as a separate area without drawing attention.

- A `.card.soft` with `.interactive` or `.hoverable` takes the tint, on `--color-surface`, when hovered. A plain `.card.soft` has no hover state.
- A panel has no hover state, so a neutral panel always rests at the quiet tone.
- With one of the six built-in intents, both keep their tint at rest, and a card deepens it on hover. `.solid` and `.ghost` are unaffected.

### Clickable cards

| Class          | Effect                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `.interactive` | Pointer cursor, hover color, press, and a focus ring. The same as `.hoverable` and `.pressable` together. |
| `.hoverable`   | The hover color only, with no pointer cursor.                                                             |
| `.pressable`   | The press and the pointer cursor only.                                                                    |

On the default look, a press scales the card down slightly (`scale(0.97)`); an aesthetic can replace that with its own press, and a reduced-motion preference turns it off.

Use one half for a card that answers only one gesture. A card that holds its own button takes `.hoverable`, so that pressing the button does not press the whole card.

```html
<article class="card">Neutral card</article>
<article class="card success solid">Filled success card</article>
<article class="card primary ghost edged">Intent border, no fill</article>
<a class="card success soft interactive" href="/settings/billing">Billing: tinted at rest, deeper on hover</a>
<article class="card hoverable">Warms on hover; the action is a nested button</article>
<aside class="panel">A sidebar</aside>
```

These classes only style. Put them on a real link or button and give it an accessible name; a `<div class="card interactive">` cannot be focused or used from a keyboard.

## Tables

The settings screen lists API keys in a table:

```html
<div class="table-wrap">
  <table class="data-table">
    <caption class="visually-hidden">
      API keys
    </caption>
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Created</th>
        <th scope="col">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Deploy bot</td>
        <td>3 March 2026</td>
        <td>Active</td>
      </tr>
      <tr class="destructive">
        <td>Old laptop</td>
        <td>12 June 2024</td>
        <td>Revoked</td>
      </tr>
    </tbody>
  </table>
</div>
```

| Class         | Effect                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.data-table` | Styles a `<table>`: full width, `.text-body` text, a header background, the surface corner, cell padding, and a hover color on body rows. |
| `.table-wrap` | Scrolls a table sideways when it is wider than its container.                                                                             |
| `.ruled`      | On `.data-table`. Draws a line between body rows.                                                                                         |
| `.ruleless`   | On `.data-table`. Draws no lines inside the table.                                                                                        |

### Row intent

A table's rows take the table's intent, so `.data-table.success` colors its header and lines green. A row with its own intent class uses that instead, as the revoked key's `<tr class="destructive">` does. `<tr class="neutral">` sets a row back to neutral inside a colored table. This is the one place an intent passes down, because rows are parts of the table, not separate components.

### Table rules

A table draws lines under its header and above its footer. `.ruled` and `.ruleless` change them together with the lines between body rows:

| Class       | Under the header and above the footer | Between body rows |
| ----------- | ------------------------------------- | ----------------- |
| `.ruleless` | No                                    | No                |
| _none_      | Yes                                   | No                |
| `.ruled`    | Yes                                   | Yes               |

`--ui-rule` is the token behind both classes, so a container can rule every table inside it: `style="--ui-rule: 100%"` acts like `.ruled`, and `0%` like `.ruleless`.

The frame around the table is separate: a table has no border by default, and `.edged` adds one. The three choices do not affect each other, so `.data-table.ruleless.edged` is a framed table with no lines inside, and `.data-table.ruled` has every row separated and no frame.

### Presentation on tables

A table reads [presentation](./composing.md#presentation) on its header, its lines, and its border:

```html
<table class="data-table success soft edged">
  …
</table>
<table class="data-table ghost">
  <!-- No header background: only lines and text -->
</table>
```

- `.soft`, the default, gives the header the quiet background tone, `--color-foreground`, for every intent. A table has no hover state for a tint, so a `.data-table.success.soft` does not turn green; its lines and border do.
- `.ghost` removes the header background, leaving lines and text.
- `.solid` fills the header with the intent color.

### Corners and scrolling

A table takes the surface corner, like a card beside it. The corner cells carry the corners, so a `<caption>` above the table is not cut off in any browser. A cell that spans rows down into a bottom corner leaves that corner square.

`.table-wrap` scrolls, and a scrolling element cuts off whatever is drawn outside it, including a tooltip on a cell; see [Tooltips → Where a tooltip gets cut off](./tooltips.md#where-a-tooltip-gets-cut-off).

- Under an aesthetic that draws a glow around components, such as `.cyber`, the wrapper makes room for the glow so it is not cut off. The wrapper then extends that far past its parent, which only shows when the parent touches the edge of the window.
- The wrapper can only make room for a glow from an aesthetic around it. Put the aesthetic class on `.table-wrap` or an element above it, not on the table alone.
- Shadows, such as a `.raised` table's, get no room and are cut off.

Keep the wrapper on any table that could be wider than its container; without it, a wide table widens the whole page.

## Quotes, code, and keys

| Class           | Use                                                                            | Default look                  | Intent colors            |
| --------------- | ------------------------------------------------------------------------------ | ----------------------------- | ------------------------ |
| `.quote`        | A `<blockquote>`. A `<cite>` inside it is upright and takes the quote's color. | A bar at the start, no fill   | Bar, background, text    |
| `.quote-inline` | An inline `<q>` quotation.                                                     | Quotation styling only        | Nothing                  |
| `.kbd`          | A key the user presses, such as <kbd>Ctrl</kbd>.                               | A tinted chip with a border   | Background, border, text |
| `.code`         | Inline code.                                                                   | A tinted chip with no border  | Background, text         |
| `.pre`          | A block of code. It scrolls sideways when a line is too long.                  | A tinted block with no border | Background, text         |

```html
<p>Press <kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">K</kbd> to search members.</p>
<p>Use the <code class="code">Authorization</code> header with your API key.</p>
<kbd class="kbd primary solid">Ctrl</kbd>
<kbd class="kbd primary soft edged">Shift</kbd>
```

A neutral `.kbd`, `.code`, or `.pre` uses the quiet tint only; an intent class adds 12% of its color over it. `.ghost` is not supported on these three: the tinted background is what makes them chips, so they keep it and `.ghost` changes nothing. Their font is `--font-mono`; see [Theming → Fonts](./theming.md#fonts).

## Next

[Accessibility](../accessibility.md) lists what the CSS does for your users and what your application still owes them.
