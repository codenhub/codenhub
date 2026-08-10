---
title: Classes
---

# CSS classes

Helper classes are CSS-only. They provide presentation and state styling, not semantics or behavior.

## Layout

Layout helpers use the shared `--layout-gap` token. `.tight` sets it to `0.5rem` and `.loose` sets it to `1.5rem` within a view, stack, cluster, or auto-grid.

- `.view` is a flex container; `.vertical` and `.horizontal` set its direction, and horizontal views wrap with centered cross-axis alignment.
- `.stack` is a vertical flex stack.
- `.cluster` is a wrapping horizontal flex row; `.between` adds `space-between` alignment.
- `.auto-grid` is a responsive auto-fit grid using `--layout-grid-min`.
- `.tight` and `.loose` set the shared gap to `0.5rem` or `1.5rem` on views, stacks, clusters, and auto-grids.
- `.section` adds responsive block padding and an inline gutter.
- `.section-content` centers content at `--container-max`; `.narrow` and `.wide` select the corresponding container tokens.
- `.divider` is horizontal; `.vertical` makes it self-stretch vertically. It
  takes intent classes to color the rule and `--ui-border-width` to thicken it.

The removed `--layout-stack-gap` and `--layout-cluster-gap` tokens have no compatibility aliases.

## Content

| Class           | Purpose                                                                     | Intent affects         |
| --------------- | --------------------------------------------------------------------------- | ---------------------- |
| `.table-wrap`   | Full-width horizontal overflow wrapper for wide tables.                     | Nothing.               |
| `.table`        | Rounded nested table styling for captions, heads, footers, cells, and rows. | Head, border, hover.   |
| `.kbd`          | Inline keyboard-input styling.                                              | Surface, border, text. |
| `.quote`        | Block quote styling; nested `cite` elements receive attribution styling.    | Left border.           |
| `.quote-inline` | Inline quotation styling.                                                   | Nothing.               |
| `.code`         | Inline code formatting.                                                     | Surface.               |
| `.pre`          | Scrollable block code formatting with larger padding.                       | Surface.               |

A table's rows deliberately inherit its intent instead of resetting it, so
`.table.success` tints throughout. A row carrying its own intent still wins:

```html
<table class="table success">
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

This is the one place intent cascades, because a table's rows are parts of the
table rather than independent components.

`.table` and `.kbd` also read [presentation](#presentation). A table applies it
to its header and border, and a key cap to its whole chip:

```html
<table class="table success soft">...</table>
<kbd class="kbd primary flat">Ctrl</kbd>
<kbd class="kbd primary out">Shift</kbd>
```

Use `.table-wrap` around `.table` when table width may exceed its container:

```html
<div class="table-wrap">
  <table class="table">
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
| `.empty-state` | Centered empty-state layout with muted color.                      |

Both read intent, [presentation](#presentation), and
[material tokens](./tokens.md#material-tokens). A plain `.card` is a neutral
bordered container; only an explicit presentation tints it.

```html
<article class="card">Neutral card</article>
<article class="card success soft">Tinted success card</article>
<article class="card primary out">Intent border, no fill</article>
<a class="card interactive" href="/package">Lifts on hover</a>
<aside class="panel">Flush panel</aside>
```

`.interactive` is styling only. Use a real interactive element and give it an
accessible name; a `<div class="card interactive">` is not focusable or
operable by keyboard.

## Presentation

`.flat`, `.out`, `.ghost`, and `.soft` decide how strongly a component shows its
intent. They set [presentation tokens](./tokens.md#presentation-tokens) and
nothing else, so they work on the component itself or on any ancestor:

```html
<div class="soft">
  <button class="btn primary">Soft primary button</button>
  <span class="badge success">Soft success badge</span>
  <button class="btn primary out">Outlined; the element wins</button>
</div>
```

A declaration on the element always beats one inherited from a container, so a
container sets the default look for its subtree and any element opts out.

| Class    | Look                                                             |
| -------- | ---------------------------------------------------------------- |
| `.flat`  | Intent-colored fill with contrast text and a matching border.    |
| `.out`   | Transparent fill with a doubled intent border and readable text. |
| `.ghost` | Transparent fill and border with readable text.                  |
| `.soft`  | Lightly tinted fill, no border, readable text.                   |

Values each class ships:

| Class    | `--ui-fill` | `--ui-fg-on-fill` | `--ui-border` | `--ui-border-scale` | `--ui-hover-fill` | `--ui-hover-fg-on-fill` |
| -------- | ----------- | ----------------- | ------------- | ------------------- | ----------------- | ----------------------- |
| `.flat`  | `100%`      | `100%`            | `100%`        | `1`                 | `100%`            | `100%`                  |
| `.out`   | `0%`        | `0%`              | `100%`        | `2`                 | `14%`             | `0%`                    |
| `.ghost` | `0%`        | `0%`              | `0%`          | `1`                 | `14%`             | `0%`                    |
| `.soft`  | `12%`       | `0%`              | `0%`          | `1`                 | `22%`             | `0%`                    |

With no presentation class in scope, each component keeps its own default:
buttons are filled, alerts and badges are tinted, surfaces and controls are
neutral and bordered.

| Component                                                     | Reads                                        |
| ------------------------------------------------------------- | -------------------------------------------- |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`                 | Fill, text, border, and border width.        |
| `.kbd`                                                        | Fill, text, border, and border width.        |
| `.table`                                                      | Header fill and text, border, border width.  |
| `.ipt`, `.textarea`, `.select`, `.control-base`               | Border, border width, and a capped fill.     |
| `.checkbox`, `.radio`, `.switch`                              | Border, border width, capped unchecked fill. |
| `.progress`, `.divider`                                       | Border and border width.                     |
| `.code`, `.pre`, `.quote`, `.tooltip`, `.skeleton`, `.loader` | Intent only, not presentation.               |

Text controls and toggles cap their fill well below the `.soft` tint. `.flat`
would otherwise put typed text on a saturated background, so a `.flat` container
would make every field inside it unreadable; on those components both `.flat` and
`.soft` resolve to a much quieter tint than they produce elsewhere, because a
field has to stay legible while being typed into. `.ghost` removes the border
from a control and leaves a bottom rule, so the field keeps its affordance.

Tooltips ignore the presentation fill entirely. A transparent or hairline
tooltip floating over arbitrary content is unreadable, so the bubble stays
filled and reads only the intent. It does read the material tokens, so an
[aesthetic](#aesthetics) in scope shapes the bubble like any other component.

Intent classes do not cascade. `.primary` and its siblings stay on the element
that shows the intent, because a container silently recoloring every descendant
is a trap rather than a feature. Use `.neutral` to opt an element back out.

Presentation and [material tokens](./tokens.md#material-tokens) do cascade, so a
container can set the look of its whole subtree while any element overrides it.

## Aesthetics

An aesthetic decides what a component is _made of_: its radius, border
thickness, shadow, and shape. Aesthetics ship from opt-in entrypoints, so
importing the stylesheet is what makes the classes available:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics";
```

Import them after the base stylesheet. `.neobrutalism` and `.pixel` replace the
neutral border color, and they do so at zero specificity, so source order is what
lets them win.

Like presentation, an aesthetic class cascades to any subtree:

```html
<section class="neobrutalism">
  <button class="btn primary">Thick ink and a hard shadow</button>
  <div class="card destructive">The intent still wins over the aesthetic ink</div>
</section>
```

| Class           | Look                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `.neobrutalism` | No radius, a thick ink outline, a hard unblurred offset shadow, and a hover that moves the element into it.        |
| `.glass`        | Translucent surfaces over a blurred backdrop with a hairline highlight edge.                                       |
| `.pixel`        | Stepped corners, a chunky outline drawn as an inset ring, and the consumer-supplied `--font-pixel` over monospace. |

Aesthetics and presentations compose, but not every pair is worth using. Bad
combinations are documented rather than blocked.

| Aesthetic       | `.flat` | `.out` | `.ghost` | `.soft` |
| --------------- | ------- | ------ | -------- | ------- |
| `.neobrutalism` | Yes     | Yes    | Weak     | Yes     |
| `.glass`        | Yes     | Yes    | Yes      | Yes     |
| `.pixel`        | Yes     | Yes    | Weak     | Yes     |

"Weak" means the aesthetic's defining trait is the border or shadow that
`.ghost` removes, which leaves the element nearly unstyled.

An explicit presentation on the element still wins over the aesthetic's
defaults, and the two meet only in the border: the aesthetic supplies the
thickness and the presentation scales it, so `.out` under `.neobrutalism` gives a
4px edge rather than replacing the 2px material.

### Neobrutalism

The shadow is cast in the component's own intent, so a success button throws a
green shadow and a destructive card a red one. With no intent, both the outline
and the shadow use the ink, which follows the theme rather than the palette.

Content chips are left alone. A `.kbd`, `.code`, or `.pre` is content rather
than structure, and an ink edge on one reads as a defect: a key cap keeps the
quiet border color and a code chip keeps no border at all.

Only `.btn` and `.card.interactive` move on hover. A card lifts when it opts in
with `.interactive`; a plain card, an alert, or a panel is a container rather
than a control and stays put.

### Glass

`.glass` needs something behind it to blur. On a flat page background it renders
as a plain translucent panel.

The blur applies to `.card`, `.panel`, `.alert`, and the tooltip bubble only.
Controls stay solid and sit on the glass: a blur under every control of a dense
cluster costs a composited layer apiece and reads as noise. Controls still take
the aesthetic's radius, border, and shadow.

Under `prefers-reduced-transparency: reduce`, glass surfaces drop the blur and
become opaque.

### Pixel

`--pixel-unit` is one pixel of the imaginary low-resolution grid. Corners step by
that unit and the outline is two units thick; chips use a smaller unit. Set it on
a container to scale the whole look:

```html
<section class="pixel" style="--pixel-unit: 3px">
  <button class="btn primary">Chunkier</button>
</section>
```

`--font-pixel` is yours to supply. The package ships no font binary, so the
aesthetic has no network side effect and falls back to the monospace stack.

Nothing casts a shadow except the tooltip bubble, which needs separating from
whatever it floats over. The rest sit flat on the page.

Because the stepped shape is a clip, it also clips the border and focus outline,
which are redrawn inside the element. `.code` and `.pre` step their corners with
no visible outline, since code draws no border of its own. A few components are
squared instead of stepped: tables, progress bars, skeletons, tooltip icons, and
checkboxes. Radios keep their circle, which is the only thing distinguishing them
from a checkbox at a glance.

## Buttons

Use `.btn` with one optional intent class, one optional presentation class, optional size class, and optional state.

Intent classes map color tokens into button tone slots. [Presentation](#presentation) decides how much of that intent reaches background, text, border, and hover.

Intent classes:

| Class                               | Meaning                        |
| ----------------------------------- | ------------------------------ |
| `.neutral` _(default)_              | No specific intent.            |
| `.primary`                          | Primary action.                |
| `.secondary`                        | Secondary/accent action.       |
| `.success`                          | Successful or positive action. |
| `.warning`                          | Warning/caution action.        |
| `.destructive`, `.danger`, `.error` | Destructive or error action.   |
| `.info`                             | Informational action.          |

Every component that supports intent accepts the same list and reads the same
[intent tokens](./tokens.md#intent-tokens), so a custom intent class works
everywhere without touching a component.

Size and shape classes:

| Class                                                                  | Purpose                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `.pill`                                                                | Fully rounded button corners (`border-radius: 9999px`).      |
| `.fill` with `.out`                                                    | Filled hover treatment using intent color and contrast text. |
| `.sm`                                                                  | Smaller button.                                              |
| `.lg`                                                                  | Larger button.                                               |
| `.p-sm`, `.compact`                                                    | Compact padding modifier (`px-2.5 py-1`).                    |
| `.p-lg`, `.spacious`                                                   | Spacious padding modifier (`px-6 py-3`).                     |
| `.icon`                                                                | Square icon button. Use an accessible name in HTML.          |
| `.loading`                                                             | Loading state. Hides text and shows CSS activity indicator.  |
| `.disabled`, `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` | Disabled styling.                                            |

Examples:

```html
<button class="btn primary">Primary</button>
<button class="btn success out">Success outline</button>
<button class="btn warning soft">Warning soft</button>
<button class="btn destructive ghost">Danger ghost</button>
<button class="btn icon primary" aria-label="Create">+</button>
<button class="btn primary loading" disabled>Saving</button>
```

`.loading` is a state, not a color or presentation class. Prefer combining it with disabled behavior so users cannot trigger duplicate work. Loading buttons keep only opacity and transform transitions active so spinner and surface colors stay synchronized when theme tokens change.

## Forms

| Class or Selector                                                     | Purpose                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `.field`                                                              | Vertical field wrapper.                                         |
| `.label`                                                              | Form label text.                                                |
| `.hint`                                                               | Secondary helper text.                                          |
| `.error` inside `.field` except `.btn.error`                          | Destructive helper text.                                        |
| `.control-base`                                                       | Shared public text-control styling.                             |
| `.ipt`                                                                | Input control styling.                                          |
| `.ipt.icon`                                                           | Opts-in to displaying an input icon.                            |
| `.left` / `.right` (on `.ipt.icon` or native inputs)                  | Icon alignment (left by default).                               |
| `.email`, `.password`, `.url`, `.tel`, `.search`, `.date`, etc.       | Input type icon selectors (class or matching `type` attribute). |
| `.no-icon`, `[data-no-icon]`                                          | Suppresses auto-included icons on native form inputs.           |
| `.textarea`                                                           | Textarea control styling.                                       |
| `.select`                                                             | Select control styling.                                         |
| `input[type="checkbox"].checkbox`                                     | Custom checkbox control styling.                                |
| `input[type="radio"].radio`                                           | Custom radio control styling.                                   |
| `input[type="checkbox"].switch`                                       | Custom switch control styling.                                  |
| `[aria-invalid="true"]` on controls                                   | Destructive border and focus color.                             |
| `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` on controls | Disabled styling.                                               |

`.ipt` input icons are opt-in via `.icon` (e.g. `<input class="ipt email icon left">`).
Native inputs in `native.css` (`email`, `password`, `url`, `tel`, `search`, `month`, `week`, `time`) include input icons by default; `date` and `datetime-local` inputs retain only the browser-native picker icon. Use `.no-icon` or `data-no-icon` to suppress custom icons on the other native inputs.
Native WebKit search decorations are suppressed on `search` inputs to prevent placeholder overlap when `.icon` is omitted.

Input icons are `background-image` data URIs rather than masks, because a text
input is a replaced element with no pseudo-element to mask, and masking the
input itself would clip its border, background, and text. A data URI cannot read
a custom property, so each icon ships light and dark artwork and the theme
re-points an alias. Input icons therefore follow the theme but not the intent.
Override one with `--ipt-icon-src` and `--ipt-icon-src-focus`:

```html
<input class="ipt icon" style="--ipt-icon-src: url('/icons/user.svg')" />
```

`.checkbox`, `.radio`, and `.switch` accept the same intent classes as buttons
to set the checked color:

| Class                               | Meaning                 |
| ----------------------------------- | ----------------------- |
| `.neutral` _(default)_              | Text color.             |
| `.primary`                          | Primary color.          |
| `.secondary`                        | Secondary/accent color. |
| `.success`                          | Success color.          |
| `.warning`                          | Warning color.          |
| `.destructive`, `.danger`, `.error` | Destructive color.      |
| `.info`                             | Info color.             |

Text controls also take intent, which colors the resting border and the
focus-visible border, and presentation, which sets border weight and a capped
tint:

```html
<input class="ipt success" placeholder="Valid" />
<input class="ipt out" placeholder="Heavier border" />
<input class="ipt ghost" placeholder="Underline only" />
<div class="soft">
  <input class="ipt" placeholder="Tinted from the container" />
</div>
```

`.control-base` is a public low-level utility from the form entrypoint. It
provides the shared control dimensions, border, placeholder, focus-visible,
invalid, and disabled styles composed by `ipt`, `textarea`, and `select`. Use it
for custom text-like controls; prefer those higher-level utilities when they fit.

Example:

```html
<label class="field">
  <span class="label">Email</span>
  <input class="ipt email icon" type="email" aria-invalid="true" aria-describedby="email-error" />
  <span class="error" id="email-error">Enter a valid email.</span>
</label>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="checkbox" class="checkbox success" />
  <span>Accept terms</span>
</label>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="radio" class="radio secondary" name="plan" />
  <span>Standard plan</span>
</label>
<label style="display: flex; gap: 0.5rem; align-items: center">
  <input type="checkbox" class="switch destructive" />
  <span>Enable</span>
</label>
```

## Feedback

| Class            | Purpose                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `.alert`         | Inline feedback surface.                                                     |
| `.icon`          | Subclass of `.alert`. Adds a corresponding intent icon and padding.          |
| `.badge`         | Compact status pill.                                                         |
| `.ai`            | Low-level activity indicator base. Applies CSS mask to show a spinner SVG.   |
| `.loader`        | Standalone inline loader. Composes `.ai` with size and color styles.         |
| `.skeleton`      | Ambient loading placeholder.                                                 |
| `.progress`      | Progress track. Uses `--progress-value` variable.                            |
| `.active`        | Optional on `.progress` to add a track shimmer.                              |
| `.indeterminate` | Optional on `.progress` to animate a moving fill without `--progress-value`. |

Activity indicator modifier classes (compose with `.loader` or any element using `.ai`):

| Class                  | Animation style                         |
| ---------------------- | --------------------------------------- |
| _(default / `.ai`)_    | Circular spinner (rotating arc).        |
| `.dots-wave`           | Three dots bouncing up/down in a wave.  |
| `.dots-fade`           | Three dots fading in and out.           |
| `.dots-queue`          | Dot queuing from left to right.         |
| `.dots-rotate`         | Side dots rotating around a center dot. |
| `.dots-grow`           | Three dots growing and shrinking.       |
| `.dots-grow-alternate` | Outer dots small, center dot pulses.    |
| `.dot-bounce`          | Single dot bouncing with squash effect. |
| `.bars-wave`           | Three vertical bars scaling in a wave.  |
| `.pulse-ring`          | Two concentric rings pulsing outward.   |

These variants retain their embedded SVG animations normally. Under
`prefers-reduced-motion: reduce`, loader CSS substitutes a corresponding static
mask. This fallback is part of focused loader, button, and components imports;
it does not depend on the global reset.

Loader size modifiers:

| Class    | Size              |
| -------- | ----------------- |
| _(none)_ | Default (`2rem`). |
| `.sm`    | Small (`1.5rem`). |
| `.lg`    | Large (`2.5rem`). |

Alerts, badges, progress bars, skeletons, and loaders accept `.primary`,
`.secondary`, `.success`, `.warning`, `.destructive`, `.danger`, `.error`, and
`.info`. Without an intent, they use the text palette, except `.loader`, which
keeps `currentColor` so it matches whatever content surrounds it.

```html
<span class="loader success" aria-hidden="true"></span>
<span class="skeleton info"></span>
```

`.icon` is a subclass of `.alert`. When applied as `.alert.icon`, it increases
the left padding and adds an embedded SVG. Success, warning, and destructive
intents use corresponding symbols; other intents use the information symbol.

Alerts and badges read the shared [presentation](#presentation) classes. Without
one they use a tinted surface, intent-colored text, and a mixed intent border.

`.left-accent` is alert-only and sits outside the presentation contract: it is a
border-side treatment rather than a strength, so it does not cascade from a
container.

| Class          | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `.left-accent` | Tinted surface with only a four-pixel intent-colored left border. |

Examples:

```html
<div class="alert success" role="status">Saved successfully.</div>
<div class="alert primary flat" role="status">Deployment started.</div>
<div class="alert warning soft icon" role="status">Review required.</div>
<div class="alert destructive left-accent" role="alert">Deployment failed.</div>
<span class="badge warning">Queued</span>
<span class="badge success flat">Live</span>
<span class="badge info soft">Draft</span>
<span class="loader" aria-hidden="true"></span>
<span class="loader dots-wave" aria-hidden="true"></span>
<span class="loader dots-fade" aria-hidden="true"></span>
<span class="loader bars-wave" aria-hidden="true"></span>
<span class="loader pulse-ring sm" aria-hidden="true"></span>
<span class="loader dots-grow lg" aria-hidden="true"></span>
<div
  class="progress"
  role="progressbar"
  aria-label="Upload progress"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow="64"
  style="--progress-value: 64%"
></div>
<div
  class="progress secondary active"
  role="progressbar"
  aria-label="Upload progress"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow="64"
  style="--progress-value: 64%"
></div>
<div
  class="progress info indeterminate"
  role="progressbar"
  aria-label="Loading"
  aria-valuemin="0"
  aria-valuemax="100"
></div>
```

## Tooltips

| Class or Attribute                 | Purpose                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| `.tooltip`                         | Tooltip host. Uses `data-tooltip` as pseudo-element content. |
| `.tooltip.tooltip-icon`            | Circular icon-style tooltip host.                            |
| `[data-tooltip-position="top"]`    | Positions tooltip above host.                                |
| `[data-tooltip-position="bottom"]` | Positions tooltip below host.                                |
| `[data-tooltip-position="left"]`   | Positions tooltip left of host.                              |
| `[data-tooltip-position="right"]`  | Positions tooltip right of host.                             |
| No `data-tooltip-position`         | Defaults to top placement.                                   |
| `[data-state="open"]`              | Shows tooltip without hover.                                 |

Example:

```html
<button
  class="tooltip tooltip-icon"
  data-tooltip="More details"
  data-tooltip-position="right"
  aria-label="More details"
>
  ?
</button>
```

CSS pseudo-element tooltips are presentational. They are not a complete accessible tooltip implementation by themselves.

## Typography Utilities

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
