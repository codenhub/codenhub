---
title: Accessibility
description: What the CSS does for focus, states, motion, contrast, forced colors, and right-to-left text, and what your application still owes its users.
order: 5
---

# Accessibility

The settings screen is built, and the CSS has done its part along the way: every field shows where focus is, an invalid email turns red, and the spinner stops for users who ask for less motion. The rest is up to your HTML and JavaScript. This package styles states; it does not provide semantic elements, ARIA attributes, keyboard behavior, focus management, validation, or the timing of announcements.

This page lists both halves: what the CSS provides, and what your application has to add.

## Provided by CSS

### Focus and state

| Feature            | Behavior                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:focus-visible`   | A focus outline on every element, drawn with `--focus-ring`, `--focus-ring-width`, and `--focus-ring-offset`.                                                                                                                                                                                                                                                                       |
| Form control focus | `.ipt`, `.textarea`, and `.select` draw the focus outline and change their border to the intent color. Typed text in a field with an intent class is in the intent's readable tone, `--intent-strong`.                                                                                                                                                                              |
| Invalid controls   | `aria-invalid="true"` on a form control turns its border, focus color, and typed text destructive, the text in the destructive readable tone. A checkbox, radio, or switch is drawn exactly as its `.destructive` version, checked mark included.                                                                                                                                   |
| Disabled controls  | `disabled`, `aria-disabled="true"`, `data-disabled`, and `.disabled` show the disabled cursor and opacity, and a disabled control does not react to hover, including inside an `.input-group`.                                                                                                                                                                                      |
| Open state         | `data-state="open"` on a `.tooltip` shows its bubble without hover or focus, and `data-state="closed"` hides it while hovered or focused. No other component reads either.                                                                                                                                                                                                          |
| Native `<dialog>`  | A `<dialog>` with `.card`, `.panel`, `.surface`, or your own class that does `@apply surface` stays hidden until it is opened, and opens centered. A margin you set on the dialog, as a utility or in your own CSS, still overrides the centering. Other dialogs are left alone. Trapping focus, closing on Escape, and making the page behind it inert are up to your application. |

### Visually hidden content

`.visually-hidden` hides content on screen and keeps it for screen readers, as the API keys table's `<caption>` does in [Content and layout → Tables](./usage/content-and-layout.md#tables). It ships with the layout utilities: in `.`, `./native`, `./tw`, `./tw/native`, and `./tw/utilities`. It is not in `./components` or the `./tw/components` and `./tw/*` component entrypoints.

### Control boundaries

WCAG 1.4.11 asks that the boundary of a control you need to see to use it measures at least 3:1 against what is next to it.

| Feature                      | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text controls at rest        | A text control's border rests lighter than its intent's full border, below 3:1 by choice, so hover and focus have a stronger tone to change to.                                                                                                                                                                                                                                                                                                             |
| Toggles                      | `.checkbox`, `.radio`, and `.switch` draw their full border, because the border is the only thing that shows an unchecked box. A `.switch` with its own `.edgeless` is the exception, below.                                                                                                                                                                                                                                                                |
| `.edgeless` from a container | Ignored by every text control and toggle: a container cannot remove the border of a field or toggle inside it.                                                                                                                                                                                                                                                                                                                                              |
| `.edgeless` on the control   | `.ipt`, `.textarea`, `.select`, and `.switch` drop their border and no longer meet 1.4.11 at rest. `.switch.ghost` keeps its border even then, because with no fill and no border nothing would show the track.                                                                                                                                                                                                                                             |
| `.checkbox`, `.radio`        | Always draw their border, from a container or with their own `.edgeless`. `.edgeless` on them is not supported.                                                                                                                                                                                                                                                                                                                                             |
| Progress track               | By choice, the filled part carries the value and the track is a quiet background. The default track, `.soft.edgeless`, measures about 1.1:1 to 1.3:1 against the page. The filled part measures at least 3:1 against that track for every intent except warning in light (about 2.7:1) and info in dark (about 2.9:1). Where the track itself must meet 1.4.11, use `.ghost.edged` with an intent class; see [Progress outlines](#progress-outlines) below. |

### Progress outlines

On a `.progress.ghost.edged`, the track is the page, and its outline and the filled part are both drawn in the intent's color. Measured against the page, with no aesthetic:

| Intent         | Light page | Dark page | Meets 3:1                                                                |
| -------------- | ---------- | --------- | ------------------------------------------------------------------------ |
| `.primary`     | 18.96:1    | 18.96:1   | Yes                                                                      |
| `.secondary`   | 7.47:1     | 7.63:1    | Yes                                                                      |
| `.success`     | 5.14:1     | 3.69:1    | Yes                                                                      |
| `.warning`     | 3.06:1     | 6.20:1    | Yes                                                                      |
| `.destructive` | 5.80:1     | 3.27:1    | Yes                                                                      |
| `.info`        | 6.17:1     | 3.07:1    | Yes                                                                      |
| No intent      | 2.48:1     | 1.91:1    | No: the outline fails, though the filled part, in the text color, passes |

With no intent class, the outline is the quiet border gray, `--color-border`. To make a neutral track meet 1.4.11, give the bar an intent class, or set `--progress-edge` to a stronger color, such as `var(--color-accent)`, which measures 7.47:1 on a light page and 7.63:1 on a dark one. Warning on a light page and info on a dark one clear 3:1 by a small margin, so measure again if you change those colors.

### Motion and transparency

| Feature                    | Behavior                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reduced motion, components | With `prefers-reduced-motion: reduce`, every component stops its own transitions and animations: the skeleton and progress shimmer, the indeterminate bar, the tooltip, the toggle marks, and the press's motion. The press itself still happens, at once, on the default look and under every aesthetic and solo class, since it is the feedback that a click landed. |
| Reduced motion, whole page | The reset also shortens every other animation and transition on the page.                                                                                                                                                                                                                                                                                              |
| Reduced transparency       | With `prefers-reduced-transparency: reduce`, and in forced colors, `.glass`, `.glass-liquid`, and `.glass-solo` drop their blur and lens and become opaque.                                                                                                                                                                                                            |

Each component's reduced-motion rule ships with the component, so every entrypoint that includes it respects reduced motion without the reset, including `@codenhub/styles/components`, `@codenhub/styles/tw/components`, and each `/tw/*` component entrypoint. The complete and native entrypoints add the reset's page-wide rule.

The reset's rule is `!important` inside the `base` layer, and a layered `!important` beats an unlayered one, so your own `!important` cannot turn an animation back on. To keep one running for users who ask for reduced motion, such as an upload spinner you consider essential, declare it `!important` in a layer ordered before `base`. The first `@layer` statement the browser reads sets the order, so yours goes before the package:

```css
@layer essential-motion, theme, base, components, utilities;
@import "@codenhub/styles";

@layer essential-motion {
  @media (prefers-reduced-motion: reduce) {
    .upload-spinner {
      animation-duration: 1s !important;
      animation-iteration-count: infinite !important;
    }
  }
}
```

Respecting reduced motion is not the whole requirement. Motion that keeps going next to content, such as a shimmer left on a card after it has loaded, needs a way to stop it for every user; see [Feedback → Animation that keeps running](./usage/feedback.md#animation-that-keeps-running).

### Color and contrast

The measurements below are for the shipped colors. Once you change a color token, measure your own pairs again; [Theming → Change the brand color](./usage/theming.md#change-the-brand-color) shows which pairs to check.

| Feature                 | Behavior                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filled labels           | Every intent's `.solid` label meets 4.5:1 (WCAG 1.4.3) as normal text, in both themes. The lowest is success, at 5.14:1.                                                                                                                                                |
| Warning text            | `--color-warning-contrast` is near-black, not the page color, because an amber dark enough to carry white text no longer looks amber.                                                                                                                                   |
| Partial fills           | The contrast text color appears only on fills above half strength, so a text control's capped fill keeps the intent's own text color.                                                                                                                                   |
| Intent color in dark    | In dark mode a `.soft` or `.ghost` label uses the `-300` shade of its intent, so it keeps its hue instead of turning white.                                                                                                                                             |
| Toggle marks            | A checked mark measures at least 3:1 against every fill its presentation can give it, in both themes.                                                                                                                                                                   |
| Soft fills with borders | `.edged` on a `.soft` `.alert`, `.panel`, `.badge`, `.kbd`, `.code`, or `.pre` draws a border that measures below 3:1 against the 12% fill for some intents, which ones depending on the theme. Measure the pair before relying on that border as a control's boundary. |

### Forced colors and direction

| Feature        | Behavior                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forced colors  | With `forced-colors: active`, borders, checked states, a `.select`'s chevron, and a progress bar's value stay visible, drawn in system colors, under every aesthetic. An aesthetic that draws its border as an inner shadow, such as `.pixel`, draws a real border instead. Glass becomes opaque, because forced colors keep a background's transparency. |
| Text direction | Under `dir="rtl"`, the quote bar, the alert icon, the progress fill, the vertical divider, the switch knob, table alignment, and a select's chevron all switch sides. No class is needed.                                                                                                                                                                 |

In forced colors, `.text-control`, `.ipt`, `.textarea`, `.select`, the toggles, and your own class that does `@apply text-control` show a 2px `Highlight` focus outline. Inside an `.input-group`, the group draws the field's ring and the control inside draws none, so a focused field shows one ring. The native entrypoint gives unclassed text inputs, selects, textareas, checkboxes, and radios the same outline.

Checkboxes, radios, and switches use the system colors `Canvas`, `CanvasText`, `Highlight`, and `HighlightText`, so checked and unchecked stay distinct: a checked toggle is filled with `Highlight` and its mark is `HighlightText`, on the classes and in the native entrypoint alike. Shape, size, and spacing do not change.

A `.progress` bar does the same: its filled part is `CanvasText` on a `Canvas` track with a `CanvasText` outline, whatever its intent or presentation, so a half-full bar does not read as an empty one. The `.active` shimmer is not drawn.

## Required outside CSS

Use the HTML element that matches what the component does, and add the behavior the CSS cannot.

| UI               | What your application adds                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons          | `<button>` for actions and `<a href>` for navigation. An accessible name, such as `aria-label`, on every `.btn.icon`.                                                                                                                                   |
| Forms            | A `<label>` for each control, the right `type`, validation, and `aria-describedby` linking hints and errors. Keep hints and errors outside the `<label>`, and give a `.switch` `role="switch"`.                                                         |
| Alerts           | `role="status"` for a confirmation such as "Profile saved", or `role="alert"` for an error that needs attention now.                                                                                                                                    |
| Toasts           | A live region, a way to dismiss it, focus rules, and a pause on any timeout.                                                                                                                                                                            |
| Tooltips         | A real `id` and `role="tooltip"` on the bubble, referenced from the trigger's `aria-describedby`. Dismissal on Escape by writing `data-state="closed"`; see [Tooltips](./usage/tooltips.md#hover-linger-and-escape). The bubble can already be hovered. |
| Progress         | A `<progress>` element, or `role="progressbar"` or `role="meter"` with ARIA values, when the value must be announced.                                                                                                                                   |
| Skeletons        | `aria-hidden="true"` on loading visuals, including a spinner you bring, and the loading state announced some other way when needed.                                                                                                                     |
| Ongoing motion   | A way to pause, stop, or hide motion that is not essential; see [Feedback → Animation that keeps running](./usage/feedback.md#animation-that-keeps-running).                                                                                            |
| Popovers, modals | Focus trapping, closing on Escape, an inert background, labels, and roles.                                                                                                                                                                              |

## State attributes

Prefer native attributes:

```html
<button class="btn primary" disabled>Saving…</button> <input class="ipt" type="email" aria-invalid="true" aria-describedby="email-error" />
```

Use ARIA or data attributes where the element or your component library has no native one:

```html
<a class="btn secondary" aria-disabled="true">Export data</a>
<span class="tooltip" data-state="open">
  <button type="button" class="tooltip-icon" aria-label="About public profiles" aria-describedby="public-profile-help">?</button>
  <span class="tooltip-bubble" role="tooltip" id="public-profile-help">Anyone with the link can see your name and photo.</span>
</span>
```

`aria-disabled="true"` tells assistive technology the control is disabled, but it does not stop a click or a key press. Use the `disabled` attribute, or stop the action in JavaScript.

## Next

That completes the reading path. The [Introduction](./index.md) links every page, and [Composing](./usage/composing.md), [Customizing](./usage/customizing.md), and [Content and layout](./usage/content-and-layout.md) are the lookup pages for later.
