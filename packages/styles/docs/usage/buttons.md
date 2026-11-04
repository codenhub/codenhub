---
title: Buttons
description: Destructive and secondary actions, icon buttons, sizes, link buttons, disabled states, and loading icons.
order: 1
---

# Buttons

The settings screen has a Save button and a Cancel button. This page adds the rest of its actions: a danger zone with a destructive Delete button, an icon button that copies an API key, and smaller buttons for a dense row. It also covers disabled buttons and how to load the icons used here and on later pages.

## Add a danger zone

A destructive action goes in its own card at the bottom of the screen. The card is soft and destructive so it reads as a warning; the button is solid so it is the loudest thing in that card:

```html
<section class="card soft destructive stack" aria-labelledby="danger-title">
  <h2 class="text-title-sm" id="danger-title">Delete account</h2>
  <p>This removes your projects, invoices, and API keys. It cannot be undone.</p>
  <div class="cluster">
    <button class="btn destructive" type="button">Delete account</button>
    <button class="btn ghost" type="button">Export data first</button>
  </div>
</section>
```

The card and the button each name `.destructive`, because [intent does not pass down](../concepts.md#intent-which-color). The Export button keeps its neutral color inside the red card for the same reason.

## Choose a fill and an edge

A button accepts one intent, one fill class, and one edge class, all optional. With none, a button is solid and edgeless:

```html
<button class="btn primary">Save changes</button>
<button class="btn secondary">Preview</button>
<button class="btn primary soft">Invite member</button>
<button class="btn destructive ghost edged">Revoke key</button>
<button class="btn ghost">Cancel</button>
```

A **neutral** button never fills completely. Its color is the page's own text color, so a full fill would be a black or white block, the loudest thing on the page for the intent that means nothing in particular. A neutral `.solid` button stops at a 20% fill instead, a quiet gray a step darker than `.soft`. Every named intent fills to 100%.

On hover, a button's fill deepens by `--hover-step` (14%), so a `.ghost` button picks up a tint and a `.solid` one changes to its intent's hover color. On press it scales down slightly (`scale(0.97)`); an [aesthetic](./aesthetics.md) can replace that with its own press, and a user's reduced-motion preference turns it off.

## Sizes and shapes

| Class   | Effect                                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| _none_  | At least 2.5rem tall (`--control-height`), 1rem side padding, and the same font size as the surrounding text.                                |
| `.sm`   | At least 2rem tall, 0.75rem side padding, 0.875rem text.                                                                                     |
| `.lg`   | At least 3rem tall, 1.25rem side padding, 1.0625rem text.                                                                                    |
| `.pill` | Fully rounded ends.                                                                                                                          |
| `.icon` | Square. At least 2.5rem on each side, 2rem with `.sm`, 3rem with `.lg`.                                                                      |
| `.p-xs` | Tightest padding (0.5rem sides, 0.125rem top and bottom). Also removes the minimum height, so a button fits a table cell or a dense toolbar. |
| `.p-sm` | Compact padding (0.625rem sides, 0.25rem top and bottom).                                                                                    |
| `.p-lg` | Roomy padding (1.5rem sides, 0.75rem top and bottom).                                                                                        |

A size class and a padding class can be combined. Only `.p-xs` removes the minimum height of a labeled button; every other combination keeps it. On an icon button, any `.p-*` class removes the minimum size and the button sizes to its icon plus that padding: 0.125rem, 0.25rem, or 0.75rem around it.

The base look draws corners that scale with the size: a `.sm` or `.p-sm` button has slightly smaller corners than a default one, and `.lg` slightly larger.

## Icon buttons

The API keys list on the settings screen has a copy button beside each key. An icon-only button needs an accessible name, because the icon has no text a screen reader can read:

```html
<button class="btn icon ghost" type="button" aria-label="Copy API key">
  <i class="ic-lucide-copy" aria-hidden="true"></i>
</button>
<button class="btn ghost sm" type="button">
  <i class="ic-lucide-download" aria-hidden="true"></i>
  Download invoice
</button>
```

A button is a flex row with a 0.5rem gap, so an icon next to a label is spaced without extra markup.

### Loading icons

This package ships no icons. The examples in these docs use `@codenhub/icons` with the Lucide family, and its class names are always written with the family, as `ic-lucide-copy`. Install it and load it once, next to this package:

```sh
pnpm add @codenhub/icons
```

With compiled CSS, import the base rules and each family you use:

```css
@import "@codenhub/styles";
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

With Tailwind source, import its Tailwind entrypoint after this package's:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/icons/tw";
```

Any other icon works too: an inline `<svg>` with `stroke="currentColor"` or `fill="currentColor"` takes the button's text color the same way.

## Links that look like buttons

A link that navigates, such as "View billing history", is still a link. Write it as `<a href>` with `.btn`, and it gets the same look:

```html
<a class="btn secondary ghost edged" href="/settings/billing">View billing history</a>
```

Do not use `<div class="btn">` or `<span class="btn">`: they look like buttons but cannot be focused or activated from a keyboard. Use `<button>` for actions and `<a href>` for navigation.

## Disabled buttons

Any of these makes a button look disabled: the `disabled` attribute, `.disabled`, `aria-disabled="true"`, or `data-disabled`. A disabled button is drawn at 58% opacity with a not-allowed cursor, and does not change on hover or press.

```html
<button class="btn primary" type="submit" disabled>Save changes</button>

<a class="btn ghost" aria-disabled="true">Download invoice</a>
```

Only the `disabled` attribute stops the button from working. `.disabled`, `aria-disabled`, and `data-disabled` change the look only: a click or the Enter key still activates it, so your code has to ignore it. `aria-disabled` is the right choice when the button should stay focusable, for example so a tooltip can explain why it is disabled. A link has no `disabled` attribute, so remove its `href` as well when it should not navigate.

## Loading state

There is no loading class. A loading button is a disabled button with a spinner icon you bring, which [Feedback](./feedback.md#show-that-the-form-is-saving) builds for the Save button. Disable it so a second click cannot submit twice.

## Next

The buttons are ready; the card they save has nothing to save yet. [Forms](./forms.md) adds the profile fields.
