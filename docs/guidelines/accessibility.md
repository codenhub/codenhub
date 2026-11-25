---
status: APPROVED
last_updated: 2026-11-22
scope: Which contrast pairs a package must meet, which it is free to choose, and what an accessibility finding has to show, for anyone writing, reviewing, or auditing a change that draws color.
---

# Accessibility guidelines

Contrast is the accessibility question reviews raise most, and most of what they raise is not a defect: a hover tint "too faint", an edge "too light" against a fill it never has to stand out from. Each such finding pushes the look darker for no reader who needed it. This document fixes which pairs are measured, against what, and to which ratio, so a finding either fails one of them or is labeled as the design opinion it is.

A package's own accessibility documentation states the values it measures and the exceptions it records, as `@codenhub/styles` does in [Accessibility](../../packages/styles/docs/accessibility.md). Where a package's own documentation and this one disagree, the package's wins for that package, and this one is fixed, as in [Security](security.md).

## The pairs that must meet their ratio

Each pair is measured on the colors as painted: a translucent color is laid over what is under it, down to the page, before its ratio is taken. Each holds in every theme, with the standard contrast and with increased contrast, in every aesthetic or variant the package ships, at rest, on hover, and when pressed, unless a rule says otherwise.

| Rule                 | Pair                                                                                                                                                               | Minimum                                           | Source      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------- |
| Text                 | Text, and an icon that carries meaning the text does not, against the ground directly under it.                                                                    | 4.5:1; 3:1 for large text (24px, or 18.66px bold) | WCAG 1.4.3  |
| A control's boundary | The edge or fill that is the only thing showing a control is there, or the only thing showing its state, against what is next to it.                               | 3:1                                               | WCAG 1.4.11 |
| Focus                | A focus indicator against the ground next to it, on every control that can take keyboard focus.                                                                    | 3:1                                               | WCAG 1.4.11 |
| State marks          | A mark that carries a control's state, such as a check, a radio dot, or a switch's knob, against every fill its presentation can give it.                          | 3:1                                               | WCAG 1.4.11 |
| Graphics             | A part of a graphic that is needed to understand content, such as a progress bar's filled part against its track, or a chart's segment against the one next to it. | 3:1                                               | WCAG 1.4.11 |

"The only thing" is the test for a boundary. A button whose label already says it is a button does not need its edge; an unchecked checkbox has nothing but its edge, so it does.

## Recorded exceptions

A package MAY draw a boundary below 3:1 by choice when its documentation records the case, the reason, and how a reader who needs more gets it. Each exception is a decision, recorded and reversed the way [Documentation](documentation.md) says decisions are, in the package that makes it; this guideline does not copy the list. `@codenhub/styles` records its exceptions in [Control boundaries](../../packages/styles/docs/accessibility.md#control-boundaries) and [Progress outlines](../../packages/styles/docs/accessibility.md#progress-outlines).

## Increased contrast

With `prefers-contrast: more`, or a package's own setting for it, every recorded exception except one a consumer asked for reaches 3:1. A package does not darken its default look to cover readers who already ask for more contrast: that is what the setting is for.

## Exempt

These are not measured, and a finding about them is a design opinion, never an accessibility defect:

- A hover or pressed tint, and an edge in a hover or pressed state, as long as the text and focus rules still hold in that state.
- Disabled controls (WCAG 1.4.3 and 1.4.11 exempt inactive components).
- Decoration: a divider between items already separated by space, a shadow, a texture, a gradient, glass's hairline.
- An edge that repeats what text already shows, such as a labeled button's border or a badge's.
- A difference between two states that a reader is not asked to tell apart by color alone, such as how far a hover moves from rest.

## What a finding has to show

An accessibility finding about contrast names:

1. The rule above it fails, or the recorded exception it says is wrong.
2. The pair: the two colors as painted, and where they meet.
3. The ratio it measured, and the theme, contrast setting, aesthetic, and state it measured it in.
4. The test that fails, or the test that is missing because no test measures that pair.

A finding that cannot name all four is reported as a design opinion, with its reasoning, and it does not block a release. A finding that argues a recorded exception is wrong names what the exception did not weigh, as any argument against a recorded decision does.

## Where the rules are tested

A package that draws color keeps a test for each rule above, over every intent or variant, theme, contrast setting, and aesthetic it ships, so a palette change that breaks a pair fails a test rather than waiting for a review. In `@codenhub/styles` they are in `packages/styles/tests/browser/contrast.spec.ts`. A palette or variant added later, such as a quieter one, is added to those tests; it is free in everything the rules do not measure.
