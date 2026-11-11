---
title: Composing
description: Lookup for how intent, presentation, aesthetic, and elevation combine, every component's default look, and which classes each component reads.
order: 8
---

# Composing

This is a lookup page. [Building a screen](../concepts.md) introduces intent, presentation, and aesthetic; this page has the complete rules for combining them, the default look of every component, which classes each component reads, and elevation.

## Combining classes

```html
<div class="soft">
  <button class="btn primary">Soft primary button</button>
  <span class="badge success">Soft success badge</span>
  <button class="btn primary ghost edged">Outlined: the class on the element wins</button>
</div>
```

- **Presentation passes down.** `.solid`, `.soft`, `.ghost`, `.edged`, and `.edgeless` work on the component or on any container, and a class on the element beats one inherited from a container. A container sets the look of everything inside it, and any element can choose its own.
- **Aesthetics and [material tokens](./customizing.md#material-tokens) pass down** the same way.
- **Intent does not pass down.** `.primary` and the other intent classes color only the element they are on. A container that silently recolored everything inside it would turn a red danger-zone card's neutral Cancel button red. `.neutral` names the default; use it where an element would otherwise take an intent, such as a table row inside a `.success` table. See [Theming → Intent tokens](./theming.md#intent-tokens).
- **Elevation does not pass down.** `.raised` lifts only the element it is on; see [Elevation](#elevation).
- **Size does not pass down.** `.sm` and `.lg` resize only the button or control they are on, so a `.sm` form does not shrink the fields inside it. See [Buttons → Sizes and shapes](./buttons.md#sizes-and-shapes) and [Forms → Sizes](./forms.md#sizes).

With the Tailwind source entrypoints, every class above is also a Tailwind utility, so variants such as `md:lg` and `dark:solid` work and `@apply btn primary soft sm` gives one class of yours the whole combination. The modifiers documented with each component, such as `.tight` or `.interactive`, are utilities too, so `@apply stack tight` works. See [Tailwind CSS v4 → Build your own components with `@apply`](../integrating/tailwind.md#build-your-own-components-with-apply), and [Presets](./presets.md) for when to reach for it.

## Component defaults

With no presentation class on it or around it, each component has its own look. "Resting elevation" is how much depth it takes when an [aesthetic](./aesthetics.md) draws depth; with no aesthetic, nothing has a shadow.

| Component                        | Fill        | Edge     | Resting elevation |
| -------------------------------- | ----------- | -------- | ----------------- |
| `.btn`                           | `.solid`    | edgeless | 1                 |
| `.card`                          | `.ghost`    | edged    | 1                 |
| `.panel`                         | `.soft`     | edgeless | 0                 |
| `.alert`                         | `.soft`     | edged    | 0                 |
| `.badge`                         | `.soft`     | edgeless | 0                 |
| `.ipt`, `.textarea`, `.select`   | `.ghost`    | edged    | 0                 |
| `.input-group`                   | `.ghost`    | edged    | 0                 |
| `.checkbox`, `.radio`, `.switch` | `.soft`     | edged    | 0                 |
| `.kbd`                           | `.soft`     | edged    | 0                 |
| `.code`, `.pre`                  | `.soft`     | edgeless | 0                 |
| `.data-table`                    | `.soft`     | edgeless | 0                 |
| `.progress` (the track)          | `.soft`     | edgeless | 0                 |
| `.tooltip-bubble`                | `.solid`    | edged    | 0                 |
| `.quote`                         | `.ghost`    | edged    | 0                 |
| `.skeleton`, `.divider`          | Intent only | None     | 0                 |

A neutral `.solid` fills only to 20%; see [Theming → Intent tokens](./theming.md#intent-tokens). The neutral exceptions to these fills are in [Presentation](#presentation).

## Presentation

Presentation is two separate choices. `.solid`, `.soft`, and `.ghost` set how much of the intent color fills a component. `.edged` and `.edgeless` set whether it draws a border. They set [presentation tokens](./customizing.md#presentation-tokens) and nothing else.

| Class       | Look                                                      | `--ui-fill` | `--ui-fg-on-fill` | `--ui-border` |
| ----------- | --------------------------------------------------------- | ----------- | ----------------- | ------------- |
| `.solid`    | Filled with the intent color, with contrast text.         | `100%`      | `100%`            |               |
| `.soft`     | A light tint, with intent-colored text.                   | `12%`       | `0%`              |               |
| `.ghost`    | No fill at rest, with intent-colored text.                | `0%`        | `0%`              |               |
| `.edged`    | An intent-colored border, as thick as the aesthetic sets. |             |                   | `100%`        |
| `.edgeless` | No border.                                                |             |                   | `0%`          |

```html
<button class="btn primary">Solid, the button default</button>
<button class="btn soft edged">Tinted, with a border</button>
<button class="btn primary ghost edged">Outline</button>
<button class="btn ghost">Ghost: picks up a tint on hover</button>
<input class="ipt soft edgeless" aria-label="Search" />
```

A fill class never sets the border, and a border class never sets the fill. `.solid.edged` looks the same as `.solid.edgeless`, because the border fades out as the fill fills in.

The border is the outline of the component and nothing else. Lines inside a component, such as the rules between table rows, are a separate switch; see [Content and layout → Table rules](./content-and-layout.md#table-rules).

### Neutral surfaces rest untinted

A neutral `.card.soft`, `.panel`, and `.alert` show no tint at rest. They use the quiet background tone one step off the page instead (`--color-foreground`), because a gray tint on every neutral box looks dirty rather than quiet.

- A `.card.soft` with `.interactive` or `.hoverable` shows the tint on hover. A plain `.card.soft` and a `.panel` have no hover state.
- With one of the six built-in intents, all three keep the ordinary 12% tint, and a card deepens it on hover. An intent you defined yourself is treated as neutral here; see [Theming → Your own intent](./theming.md#your-own-intent).
- The presentation can come from the element or from a container: `<div class="soft"><div class="card">` rests like `.card.soft`, and a `.ghost` or `.solid` container gives a `.panel` or `.alert` the plate its own class would.
- A `.badge` keeps its 12% tint even when neutral. It has no border, so without the tint it would disappear into the text around it.

`.kbd`, `.code`, and `.pre` work differently. They rest on their intent's subtle tone, `--intent-subtle`, which is `--color-surface` for neutral, and a built-in intent adds 12% of its color over it. An intent you defined yourself shows its own `--intent-subtle` tint without that extra 12%.

### Text controls and toggles

- **Text controls** cap their fill so typed text stays readable: at most 6% from a container, 12% for their own `.soft`, and 20% for their own `.solid`. They ignore an `.edgeless` from a container and honor their own. See [Forms → Fill and border on text controls](./forms.md#fill-and-border-on-text-controls).
- **Toggles** cap their unchecked fill at 40% and fill to 100% once checked. `.checkbox` and `.radio` always draw their border, and so does `.switch.ghost`. See [Forms → Checked and unchecked colors](./forms.md#checked-and-unchecked-colors).

### Tooltip bubbles

A tooltip bubble is always filled and opaque, and draws a thin border that only its own `.edgeless` removes. With no intent it uses `--color-tooltip`; an intent fills it with that intent's color. [Tooltips → How the bubble looks](./tooltips.md#how-the-bubble-looks) has the colors.

### Progress tracks

`.progress` reads both choices on its track. The filled part is always the intent color at full strength. `.solid` is not supported on the track, because the track and the filled part would be the same color. `.ghost.edgeless` renders but leaves the track with no visible frame; `.ghost.edged` draws an outline around it.

### Unsupported combinations

| Component               | Class       | What happens                                                                                 |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `.kbd`, `.code`, `.pre` | `.ghost`    | The chip still draws its tinted background, because that background is what makes it a chip. |
| `.progress`             | `.solid`    | The track and the filled part are the same color, so the value cannot be seen.               |
| `.checkbox`, `.radio`   | `.edgeless` | Ignored: the border is always drawn.                                                         |

## Component axis reference

Which classes change each component. "Material" is what an [aesthetic](./aesthetics.md) can change on it: "Shape" means corner, border width, shadow, hover, and outline; the narrower entries list what applies.

| Components                                                | Intent | Fill | Edge | Material           |
| --------------------------------------------------------- | ------ | ---- | ---- | ------------------ |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`             | Yes    | Yes  | Yes  | Shape              |
| `.kbd`, `.data-table`                                     | Yes    | Yes  | Yes  | Corner and edge    |
| `.quote`                                                  | Yes    | Yes  | Yes  | Edge width         |
| `.divider`, `.skeleton`                                   | Yes    | No   | No   | No                 |
| `.ipt`, `.textarea`, `.select`, `.text-control`           | Yes    | Yes  | Yes  | Shape              |
| `.input-group`                                            | Yes    | Yes  | Yes  | Shape              |
| `.surface`                                                | Yes    | Yes  | Yes  | Shape              |
| `.checkbox`, `.radio`                                     | Yes    | Yes  | No   | Corner and edge    |
| `.switch`                                                 | Yes    | Yes  | Yes  | Corner and edge    |
| `.progress`                                               | Yes    | Yes  | Yes  | Corner and edge    |
| `.code`, `.pre`                                           | Yes    | Yes  | Yes  | Corner and outline |
| `.tooltip-bubble`                                         | Yes    | Yes  | Yes  | Shape and blur     |
| `.table-wrap`, `.quote-inline`, layout and text utilities | No     | No   | No   | No                 |

"Yes" means the class changes the component, and "No" means it does not; the package's tests check both. What each component does with a class:

| Component                                       | Reads                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`   | Fill, text color, border, and border width.                                            |
| `.kbd`                                          | Fill, text color, border, and border width.                                            |
| `.data-table`                                   | Header fill and text color, border, and border width.                                  |
| `.ipt`, `.textarea`, `.select`, `.text-control` | Border, border width, and a capped fill.                                               |
| `.input-group`                                  | Border, border width, and a capped fill.                                               |
| `.checkbox`, `.radio`                           | A capped fill, checked and unchecked.                                                  |
| `.switch`                                       | Border, border width, and a capped fill.                                               |
| `.quote`                                        | Fill, text color, border, and border width.                                            |
| `.code`, `.pre`, `.tooltip-bubble`              | Fill, text color, border, and material.                                                |
| `.progress`                                     | Track fill, border, and border width. The filled part is always the full intent color. |
| `.skeleton`, `.divider`                         | Intent only.                                                                           |

State and modifier classes such as `.interactive`, `.hoverable`, `.pressable`, `.p-sm`, and `.vertical` are documented with their component. Each takes effect on the components that read it, and on `/tw` they are utilities, so `@apply card interactive` works. An invalid control is marked with `aria-invalid="true"`, not a class; see [Forms](./forms.md#show-a-validation-error).

## Elevation

Elevation is how much depth a component takes. Nothing has a shadow until an [aesthetic](./aesthetics.md) draws depth or one of these classes asks for it.

| Class       | Depth                                                                                |
| ----------- | ------------------------------------------------------------------------------------ |
| `.flat`     | None. Glass surfaces keep their shadow, because it is part of what glass is made of. |
| `.raised`   | One step of the depth in scope: cards and tiles that sit close to the page.          |
| `.floating` | Two steps: menus and popovers.                                                       |

```html
<article class="card raised">Lifted</article>
<div class="floating panel">A menu</div>
<article class="card flat">Flat, whatever the aesthetic says</article>
```

Each class multiplies the shadow of the aesthetic in scope. The same `.raised` is a soft blur on a plain page and a hard offset shadow under `.neobrutalism`: the aesthetic decides what depth looks like, and the class decides how much of it this element takes.

The class does not pass down. It lifts or flattens only the element it is on, and an element inside it takes no depth from it. Give each element that needs depth its own class. The spread of a shadow is not multiplied, because an aesthetic that draws its border as an inner shadow uses the spread for that border.

These classes are separate from the `--elevation-*` shadow tokens in [Theming → Foundation tokens](./theming.md#foundation-tokens), which are fixed shadows for elements you style yourself.
