---
title: Accessibility
---

# Accessibility responsibilities

This package provides CSS hooks for accessible states. It does not provide semantic HTML, ARIA attributes, keyboard behavior, focus management, validation, announcement timing, or JavaScript behavior.

## Provided By CSS

| Feature                 | Behavior                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `:focus-visible`        | Global focus-visible outline using `--focus-ring`, `--focus-ring-width`, and `--focus-ring-offset`.                        |
| Form control focus      | `.ipt`, `.textarea`, and `.select` draw the global focus ring and move their line to the intent color.                     |
| Control boundaries      | Text controls rest at `--_line-rest` of their intent, under 3:1 by choice; hover and focus take the tone whole.            |
| Toggle boundaries       | `.checkbox`, `.radio`, and `.switch` draw their line whole, because it is the only thing marking an unchecked box.         |
| Cascaded `.edgeless`    | Floored on every text control: a container cannot erase the line of a field or toggle nobody classed.                      |
| Own `.edgeless`         | On the element, `.ipt`, `.textarea`, `.select`, and `.switch` do drop their line and do not meet 1.4.11 at rest.           |
| `.checkbox`/`.radio`    | Never drop their line, on the element or from a container. `.edgeless` on them is unsupported, not merely discouraged.     |
| Invalid controls        | `[aria-invalid="true"]` applies destructive border/focus color on form controls.                                           |
| Disabled controls       | `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]`, and `.disabled` apply disabled cursor/opacity where supported.  |
| Current page            | `[aria-current="page"]` applies primary color and stronger font weight.                                                    |
| Open state              | `[data-state="open"]` styles supported surfaces and tooltips.                                                              |
| Reduced-motion loaders  | Loader variants use animated embedded SVGs normally and static masks when `prefers-reduced-motion: reduce` matches.        |
| Reduced-motion document | The reset additionally shortens document animations and transitions when `prefers-reduced-motion: reduce` matches.         |
| Filled labels           | Every intent's `.solid` label meets 1.4.3 (4.5:1) as normal text, in both themes. Lowest is success at 5.14:1.             |
| Warning ink             | `--color-warning-contrast` is the near-black tone, not the page tone. Amber dark enough to carry white is not amber.       |
| Partial fills           | Contrast ink appears only past a half fill, so a capped plate keeps `--intent-strong` rather than walking toward the page. |
| Intent hue in dark      | `--intent-strong` is the `-300` shade in dark, so a soft or ghost label keeps its own hue instead of reading white.        |
| Toggle marks            | A checked mark meets 3:1 as a state indicator on every plate its fill class can paint, in both themes.                     |
| Forced colors           | `forced-colors: active` preserves visible borders and checked states using system colors.                                  |

The loader fallback is embedded in loader CSS, so focused imports that include
loaders honor reduced motion without the reset. This includes
`@codenhub/styles/components`, `@codenhub/styles/tw/components`,
`@codenhub/styles/tw/button`, and `@codenhub/styles/tw/loader`. The complete and
native entrypoints include both that fallback and the reset's broader animation
and transition shortening.

In forced colors, class-based form controls including `.text-control` receive a
2px `Highlight` system-color focus outline. The native entrypoint provides the
same visible system outline for unclassed text inputs, selects, textareas,
checkboxes, and radios.

Custom checkboxes and radios use the system `Canvas`, `CanvasText`, `Highlight`,
and `HighlightText` colors in forced-colors mode so checked and unchecked states
remain distinct. Shape, size, and spacing remain unchanged.

## Required Outside CSS

Use semantic HTML and behavior appropriate for the component.

| UI                | Required outside CSS                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Buttons           | Use `<button>` for actions or accessible links for navigation. Add accessible names for `.btn.icon`.            |
| Forms             | Use labels, `type`, validation logic, `aria-describedby`, and error message relationships.                      |
| Alerts            | Add `role="status"` or `role="alert"` based on announcement urgency.                                            |
| Toasts            | Add live-region behavior, dismissal behavior, focus rules, and pause/timeout logic when needed.                 |
| Tooltips          | Provide accessible names/descriptions. CSS pseudo-element content is not enough for all assistive tech.         |
| Progress          | Use semantic progress elements or ARIA values when numeric progress must be announced.                          |
| Skeletons/loaders | Mark decorative loading visuals with `aria-hidden="true"` and expose loading state elsewhere when needed.       |
| Popovers/modals   | Provide focus trapping, escape handling, inert background behavior, labels, and roles outside this CSS package. |

## State Attribute Guidance

Prefer native attributes first:

```html
<button class="btn primary" disabled>Saving</button>
<input class="ipt" aria-invalid="true" aria-describedby="email-error" />
```

Use ARIA or data attributes when native attributes are not available for the element or library:

```html
<a class="btn secondary" aria-disabled="true">Unavailable</a>
<button class="tooltip tooltip-icon" data-state="open" data-tooltip="More details" aria-label="More details">?</button>
```

`aria-disabled="true"` communicates disabled state but does not prevent activation. JavaScript or element choice must prevent activation when required.
