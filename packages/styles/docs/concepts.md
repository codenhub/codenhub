---
title: Building a screen
description: Lay out the settings page, set its type, and add cards and buttons while learning intent, fill, edge, and aesthetic.
order: 3
---

# Building a screen

This page turns the empty shell from [Setup](./setup.md) into the first real part of the settings screen: a page header, a profile card with Save and Cancel buttons, and a plan summary beside a usage card. On the way it introduces the three choices every component makes, intent, presentation, and aesthetic, at the moment the screen needs each one. Everything else in these docs builds on this model.

## The smallest screen

A page header and one card with one button:

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <section class="card stack">
      <h2 class="text-title-sm">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <button class="btn primary" type="button">Save changes</button>
    </section>
  </div>
</main>
```

Each class does one job:

- `.section` pads the page: a responsive gutter at the sides (1 to 2rem) and generous space above and below (4 to 7rem).
- `.section-content` centers a column with a maximum width; `.narrow` makes that 48rem instead of 80rem, a comfortable width for a form.
- `.stack` lays its children out vertically with a 1rem gap.
- `.text-title` and `.text-title-sm` set heading sizes: 1.875rem bold and 1.25rem semibold.
- `.card` is a bordered container with rounded corners and 1.25rem of padding.
- `.btn` makes a button, and `.primary` gives it the primary color.

Headings are not sized by their tag: the reset gives an `<h1>` with no type class the same size and weight as the text around it. That keeps the document structure, which heading level an element is, separate from the size you want it to look. If you want headings styled automatically, see [Setup → Classless HTML](./setup.md#classless-html).

## Lay out the page

Three layout helpers cover most screens, and all three use the same gap, `--layout-gap` (1rem):

- `.stack` for vertical lists of blocks.
- `.cluster` for a row that wraps when it runs out of room, such as a group of buttons. Add `.between` to push the first and last items to opposite ends.
- `.auto-grid` for a grid of equal cards that adds or drops columns as the space changes. A column is never narrower than `--layout-grid-min` (16rem) unless the container itself is.

`.tight` (0.5rem) and `.loose` (1.5rem) change the gap of the layout they sit on. A layout nested inside keeps its own gap.

Add a header and put the buttons in a row:

```html
<main class="section">
  <div class="section-content narrow stack loose">
    <header class="stack tight">
      <h1 class="text-title">Account settings</h1>
      <p>Manage your profile, plan, and security.</p>
    </header>

    <section class="card stack" aria-labelledby="profile-title">
      <h2 class="text-title-sm" id="profile-title">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <div class="cluster">
        <button class="btn primary" type="button">Save changes</button>
        <button class="btn ghost" type="button">Cancel</button>
      </div>
    </section>
  </div>
</main>
```

[Content and layout](./usage/content-and-layout.md) lists every layout helper, including `.view`, `.divider`, and `.visually-hidden`, and the full type scale.

## Intent: which color

The Save button is `.primary` and the Cancel button has no intent, which makes it neutral. An intent class picks a color role:

| Class          | Use it for                            | Default color                           |
| -------------- | ------------------------------------- | --------------------------------------- |
| _none_         | Anything without a meaning of its own | The page's text and border grays        |
| `.primary`     | The main action on a screen           | Near-black on light, near-white on dark |
| `.secondary`   | A second, quieter action              | Mid gray                                |
| `.success`     | Confirmation and completed states     | Emerald green                           |
| `.warning`     | Something that needs attention soon   | Amber, with dark text                   |
| `.destructive` | Deleting, revoking, and errors        | Rose red                                |
| `.info`        | Neutral notices and help              | Indigo                                  |

Intent stays on the element that carries it. Putting `.destructive` on a `<section>` does not turn every button inside it red; you write it on each button. This is deliberate: a container that silently recolored everything inside it would turn a red danger zone's Cancel button red too.

`.neutral` names the default explicitly. You rarely need it, because no intent class already means neutral; it matters where color would otherwise come from elsewhere, such as a table row, which inherits its table's intent.

## Presentation: how much color

The Cancel button is `.ghost`: no fill, just colored text, so it reads as less important than Save. That is the presentation axis, two independent choices:

- **Fill:** `.solid` fills the component with its intent color and switches the text to the contrasting color. `.soft` mixes in a light 12% tint and keeps the text in the intent color. `.ghost` has no fill at rest.
- **Edge:** `.edged` draws a border in the intent color; `.edgeless` draws none.

```html
<button class="btn primary">Save changes</button>
<button class="btn primary soft">Preview</button>
<button class="btn primary ghost edged">Export data</button>
<button class="btn ghost">Cancel</button>
```

Every component has its own default when no presentation class applies. A button is solid with no border. A card has no fill and a border. A form field has no fill and a border. [Composing](./usage/composing.md#component-defaults) lists the default of every component.

Unlike intent, presentation passes down. A `.soft` on a container makes everything inside it soft unless an element says otherwise, and a class on the element itself always beats one inherited from a container:

```html
<div class="cluster soft">
  <button class="btn primary">Soft primary</button>
  <button class="btn success">Soft success</button>
  <button class="btn primary solid">Solid: its own class wins</button>
</div>
```

Some components limit what presentation can do, to protect something they need. A form field inherited into a `.solid` container fills to only 6%, so typed text stays readable. A checkbox always keeps its border, because the border is the only thing that shows an unchecked box. These limits are listed with each component and collected in [Composing](./usage/composing.md).

## Finish the first screen

Add a plan summary next to a usage card in a grid, and give the summary a soft primary tint so it stands out as the account's current state:

```html
<main class="section">
  <div class="section-content narrow stack loose">
    <header class="stack tight">
      <h1 class="text-title">Account settings</h1>
      <p>Manage your profile, plan, and security.</p>
    </header>

    <section class="card stack" aria-labelledby="profile-title">
      <h2 class="text-title-sm" id="profile-title">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <div class="cluster">
        <button class="btn primary" type="button">Save changes</button>
        <button class="btn ghost" type="button">Cancel</button>
      </div>
    </section>

    <div class="auto-grid">
      <section class="card soft primary stack tight" aria-labelledby="plan-title">
        <h2 class="text-label" id="plan-title">Current plan</h2>
        <p class="text-title-sm">Team, billed yearly</p>
        <p class="text-body">Renews on 12 March 2027.</p>
      </section>
      <section class="card stack tight" aria-labelledby="usage-title">
        <h2 class="text-label" id="usage-title">Storage</h2>
        <p class="text-title-sm">48 GB of 100 GB</p>
        <p class="text-body">Shared by 6 members.</p>
      </section>
    </div>
  </div>
</main>
```

On a wide window the two cards sit side by side; when the column is too narrow for two 16rem columns and the gap between them, they stack. The [Feedback](./usage/feedback.md) page turns the storage card's number into a usage bar.

A `.card` rests at one unit of depth, but on the base look that depth has no visible shadow; it appears when an aesthetic draws one or when you add `.raised` or `.floating`. [Composing → Elevation](./usage/composing.md#elevation) covers depth.

## Aesthetic: what it is made of

The third axis changes the material of everything inside it: corners, border width, shadows, and sometimes the font. It needs its own import (see [Setup → Add an aesthetic](./setup.md#add-an-aesthetic-optional)):

```html
<main class="section neobrutalism">
  <!-- The same settings screen: square corners, thick dark lines, hard offset shadows -->
</main>
```

Like presentation, an aesthetic passes down, and a component inside it can carry a different one. You do not need it to build the screen; [Aesthetics](./usage/aesthetics.md) compares all six.

## Words these docs use

Some pages describe how a component is painted. These words have one meaning each:

| Word      | Meaning                                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fill      | How much of the intent color covers the component, from 0% (`.ghost`) to 100% (`.solid`).                                                                        |
| Cap       | The highest fill a component allows. A form field caps an inherited fill at 6%, for example.                                                                     |
| Plate     | The component's painted background: the fill, mixed over the ground.                                                                                             |
| Ground    | The color the fill is mixed over. Usually the page itself shows through; a few components set their own, such as the light intent tint under `.kbd` and `.code`. |
| Edge      | The border around the component. It is separate from rules, the lines inside a table.                                                                            |
| Ink       | A color used to draw lines: the edge, a table's rules, a checkbox's mark. "Text ink" means the color of text printed on a plate.                                 |
| Material  | What an aesthetic changes: corner radius and shape, border width and style, shadow, and transparency.                                                            |
| Slab      | A hard, unblurred shadow offset down and to one side, as `.neobrutalism` and `.chunky-tile` draw.                                                                |
| Elevation | How much of the shadow in scope an element takes: none (`.flat`), one unit (`.raised`), or two (`.floating`).                                                    |

## Tokens behind the classes

Every class reads CSS custom properties, called tokens, so you can change the result without rewriting a class:

| Kind         | Controls                                                                        | Where it is listed                                                              |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Color        | The palette: intent colors, text, borders, and backgrounds, for light and dark. | [Theming → Color tokens](./usage/theming.md#color-tokens)                       |
| Foundation   | Layout widths and gaps, corner radii, control height, focus, motion.            | [Theming → Foundation tokens](./usage/theming.md#foundation-tokens)             |
| Intent       | The color slots a component reads after an intent class picks a role.           | [Theming → Intent tokens](./usage/theming.md#intent-tokens)                     |
| Presentation | The fill and border percentages the presentation classes set.                   | [Customizing → Presentation tokens](./usage/customizing.md#presentation-tokens) |
| Material     | Radius, border width, shadow geometry, and transparency.                        | [Customizing → Material tokens](./usage/customizing.md#material-tokens)         |
| Aesthetic    | One knob per aesthetic, such as `--pixel-unit` or `--tile-lift`.                | [Customizing → Aesthetic tokens](./usage/customizing.md#aesthetic-tokens)       |

Color and foundation tokens are what most apps change first, to match a brand. The rest are lower level: components read them, and the presentation and aesthetic classes set them for you.

## Limits to know now

- **Intent does not pass down.** Write it on each element that shows it. The only exception is table rows.
- **Classes are styling only.** `<div class="btn">` looks like a button but cannot be focused or pressed with a keyboard. Use `<button>` or `<a href>`, and see [Accessibility](./accessibility.md).
- **A combination the docs do not describe is not supported.** It may render, but it can change in any release; see [Introduction → What counts as supported](./index.md#what-counts-as-supported).

## Next

The screen has one primary action and one quiet one. [Buttons](./usage/buttons.md) adds the rest: a destructive action for the danger zone, icon buttons, sizes, and disabled states.
