---
title: Accessibility
order: 5
---

# Accessibility responsibilities

This package provides CSS hooks for accessible states. It does not provide semantic HTML, ARIA attributes, keyboard behavior, focus management, validation, announcement timing, or JavaScript behavior.

## Provided by CSS

### Focus and state

| Feature            | Behavior                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:focus-visible`   | Global focus-visible outline using `--focus-ring`, `--focus-ring-width`, and `--focus-ring-offset`.                                                                                                                                                                                                                                                                                                            |
| Form control focus | `.ipt`, `.textarea`, and `.select` draw the global focus ring and move their line to the intent color.                                                                                                                                                                                                                                                                                                         |
| Invalid controls   | `[aria-invalid="true"]` applies destructive border/focus color on form controls.                                                                                                                                                                                                                                                                                                                               |
| Disabled controls  | `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]`, and `.disabled` apply disabled cursor/opacity where supported.                                                                                                                                                                                                                                                                                      |
| Open state         | `[data-state="open"]` on `.tooltip` shows its bubble without hover or focus, and `[data-state="closed"]` hides it while hovered or focused. No other component reads either.                                                                                                                                                                                                                                   |
| Native `<dialog>`  | On a `<dialog>` carrying `.card`, `.panel`, or `.surface`, the closed state and a centered open box are restored in author origin, so the dialog does not render open on load or lose its centering to another rule. It ships with those classes, on every entrypoint that has them, and leaves other dialogs alone. Focus trapping, escape handling, and inert-background behavior stay outside this package. |

### Visually hidden content

`.visually-hidden` hides content from sighted users while keeping it in the accessibility tree, using the standard clip-based recipe. It ships wherever the layout utilities do -- `.`, `./native`, `./tw`, `./tw/native`, and `./tw/utilities` -- including the vanilla entries with no Tailwind utility layer of their own; it is not part of `./components` or the narrower `./tw/components`/`./tw/*` component slices. See [Content and layout](./usage/content-and-layout.md).

### Control boundaries

| Feature              | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control boundaries   | Text controls rest at a fraction of their intent's line, under 3:1 by choice, so hover and focus have a whole tone to move the line to.                                                                                                                                                                                                                                                                                                                             |
| Toggle boundaries    | `.checkbox`, `.radio`, and `.switch` draw their line whole unless a `.switch` carries its own `.edgeless` (below), because the line is the only thing marking an unchecked box.                                                                                                                                                                                                                                                                                     |
| Cascaded `.edgeless` | Floored on every text control and toggle: a container cannot erase the line of a field or toggle nobody classed.                                                                                                                                                                                                                                                                                                                                                    |
| Own `.edgeless`      | On the element, `.ipt`, `.textarea`, `.select`, and `.switch` do drop their line and do not meet 1.4.11 at rest, except `.switch.ghost`: `.ghost` already asks for zero fill, so dropping the line too would leave no boundary at all, and `.switch.ghost.edgeless` keeps it up instead.                                                                                                                                                                            |
| `.checkbox`/`.radio` | Never drop their line, on the element or from a container. `.edgeless` on them is unsupported, not merely discouraged.                                                                                                                                                                                                                                                                                                                                              |
| Progress track       | By choice, the value carries the reading and the track is a quiet secondary cue. `.progress`'s registered default, `.soft.edgeless`, rests its track at ~1.1-1.3:1 against the page; the value clears 3:1 against that track for every intent but warning in light (~2.7:1) and info in dark (~2.9:1). `.ghost.edged` clears 3:1 for both the track's outline and the value, for every intent, in both themes -- choose it where the track itself must meet 1.4.11. |

### Motion and transparency

| Feature                   | Behavior                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reduced-motion loaders    | Loader variants use animated embedded SVGs normally and static masks when `prefers-reduced-motion: reduce` matches.                                                                                                |
| Reduced-motion components | Every component stops its own transitions and animations -- the skeleton and progress shimmer, the indeterminate sweep, the tooltip, toggle marks, and the press -- when `prefers-reduced-motion: reduce` matches. |
| Reduced-motion document   | The reset additionally shortens every other animation and transition on the page when `prefers-reduced-motion: reduce` matches.                                                                                    |
| Reduced transparency      | `.glass` and `.glass-liquid` drop their blur and lens and become an opaque surface when `prefers-reduced-transparency: reduce` matches.                                                                            |

The loader fallback and each component's own reduced-motion rule ship with the component, so every entrypoint that includes it honors reduced motion without the reset -- `@codenhub/styles/components`, `@codenhub/styles/tw/components`, and each focused `/tw/*` component entrypoint included. The complete and native entrypoints add the reset's page-wide shortening on top.

The reset's rule is `!important` inside the `base` layer, and a layered `!important` beats an unlayered one, so your own `!important` cannot switch an animation back on. To keep one running for users who ask for reduced motion -- a progress indicator you consider essential, say -- declare it `!important` in a layer ordered before `base`. The order is set by the first `@layer` statement the browser meets, so yours goes before the package loads:

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

### Color and contrast

| Feature            | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filled labels      | Every intent's `.solid` label meets 1.4.3 (4.5:1) as normal text, in both themes. Lowest is success at 5.14:1.                                                                                                                                                                                                                                                                                                                              |
| Warning ink        | `--color-warning-contrast` is the near-black tone, not the page tone. Amber dark enough to carry white is not amber.                                                                                                                                                                                                                                                                                                                        |
| Partial fills      | Contrast ink appears only past a half fill, so a capped plate keeps `--intent-strong` rather than walking toward the page.                                                                                                                                                                                                                                                                                                                  |
| Intent hue in dark | `--intent-strong` is the `-300` shade in dark, so a soft or ghost label keeps its own hue instead of reading white.                                                                                                                                                                                                                                                                                                                         |
| Toggle marks       | A checked mark meets 3:1 as a state indicator on every plate its fill class can paint, in both themes.                                                                                                                                                                                                                                                                                                                                      |
| Soft-edged border  | `.alert`, `.panel`, `.badge`, `.kbd`, and `.code`/`.pre`'s `.edged` border fades out by the component's fill amount; at `.soft`'s 12% fill this misses 3:1 against the fill for some intents, and which ones misses depends on the theme. Known, not fixed -- `--color-border`/`--intent-border` is a shared blend seam every one of them reads, so a targeted fix would need to touch it for one component without moving it for the rest. |

### Forced colors and direction

| Feature        | Behavior                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Forced colors  | `forced-colors: active` preserves visible borders and checked states using system colors.                          |
| Text direction | Quote bar, alert icon, progress fill, vertical divider, and switch knob mirror under `dir="rtl"`. No class needed. |

In forced colors, class-based form controls including `.text-control` receive a 2px `Highlight` system-color focus outline. The native entrypoint provides the same visible system outline for unclassed text inputs, selects, textareas, checkboxes, and radios.

Custom checkboxes and radios use the system `Canvas`, `CanvasText`, `Highlight`, and `HighlightText` colors in forced-colors mode so checked and unchecked states remain distinct. Shape, size, and spacing remain unchanged.

## Required outside CSS

Use semantic HTML and behavior appropriate for the component.

| UI                | Required outside CSS                                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons           | Use `<button>` for actions or accessible links for navigation. Add accessible names for `.btn.icon`.                                                                                                                                    |
| Forms             | Use labels, `type`, validation logic, `aria-describedby`, and error message relationships. Keep hints and errors outside the `<label>`, and give a `.switch` `role="switch"`.                                                           |
| Alerts            | Add `role="status"` or `role="alert"` based on announcement urgency.                                                                                                                                                                    |
| Toasts            | Add live-region behavior, dismissal behavior, focus rules, and pause/timeout logic when needed.                                                                                                                                         |
| Tooltips          | Give the bubble a real `id` and `role="tooltip"`, and reference it from the trigger's `aria-describedby`. Dismiss it on Escape by writing `data-state="closed"` (see [Tooltips](./usage/tooltips.md)); the bubble is already hoverable. |
| Progress          | Use semantic progress elements or ARIA values when numeric progress must be announced.                                                                                                                                                  |
| Skeletons/loaders | Mark decorative loading visuals with `aria-hidden="true"` and expose loading state elsewhere when needed.                                                                                                                               |
| Popovers/modals   | Provide focus trapping, escape handling, inert background behavior, labels, and roles outside this CSS package.                                                                                                                         |

## State attribute guidance

Prefer native attributes first:

```html
<button class="btn primary" disabled>Saving</button> <input class="ipt" aria-invalid="true" aria-describedby="email-error" />
```

Use ARIA or data attributes when native attributes are not available for the element or library:

```html
<a class="btn secondary" aria-disabled="true">Unavailable</a>
<span class="tooltip" data-state="open">
  <button type="button" class="tooltip-icon" aria-label="More details" aria-describedby="more-details-bubble">?</button>
  <span class="tooltip-bubble" role="tooltip" id="more-details-bubble">More details</span>
</span>
```

`aria-disabled="true"` communicates disabled state but does not prevent activation. JavaScript or element choice must prevent activation when required.
