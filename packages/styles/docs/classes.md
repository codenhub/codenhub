---
title: Classes
---

# CSS classes

Helper classes are CSS-only. They provide presentation and state styling, not semantics or behavior.

## Supported surface

A class, component, and axis combination is supported when this documentation
describes it and the package playground demonstrates it. Undocumented and
undemonstrated combinations may still produce CSS, but are not maintained
behavior. Playground variant matrices are the exhaustive demonstrations; small
examples elsewhere illustrate usage without widening that contract.

## Component axis reference

This table is the authoritative axis map for demonstrated components. "Shape"
means the component reads applicable radius, border-width, shadow, hover, or
clip/edge material tokens; an aesthetic may intentionally affect only the
materials that component draws.

Presentation is two independent axes, so they get a column each. A `Yes` means
the class changes what the component computes, which
`tests/browser/axes.spec.ts` asserts against `registry.json` in both directions:
an axis marked `Yes` must move, and an axis marked `No` must not.

| Components                                                | Intent | Fill | Edge | Aesthetic material |
| --------------------------------------------------------- | ------ | ---- | ---- | ------------------ |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`             | Yes    | Yes  | Yes  | Shape              |
| `.loader`                                                 | Yes    | No   | No   | No                 |
| `.kbd`, `.data-table`                                     | Yes    | Yes  | Yes  | Radius and edge    |
| `.quote`                                                  | Yes    | Yes  | Yes  | Edge width         |
| `.divider`, `.skeleton`                                   | Yes    | No   | No   | No                 |
| `.ipt`, `.textarea`, `.select`, `.text-control`           | Yes    | Yes  | Yes  | Shape              |
| `.checkbox`, `.radio`                                     | Yes    | Yes  | No   | Radius and edge    |
| `.switch`                                                 | Yes    | Yes  | Yes  | Radius and edge    |
| `.progress`                                               | Yes    | No   | No   | No                 |
| `.code`, `.pre`                                           | Yes    | Yes  | Yes  | Radius and clip    |
| `.tooltip`                                                | Yes    | Yes  | Yes  | Shape and overlay  |
| `.table-wrap`, `.quote-inline`, layout and text utilities | No     | No   | No   | No                 |

`.checkbox` and `.radio` are the only components that read one axis and not the
other. Their line is the only thing marking an unchecked box, so it is drawn
whatever the edge class says, from a container or from the element itself.
`.edgeless` on either is unsupported rather than merely discouraged.

Every other text control floors a _cascaded_ `.edgeless` and honours its own: a
`.edgeless` toolbar will not erase the line of a field nobody classed, while
`.ipt.edgeless` is a consumer describing what they want and gets it.

Intent aliases such as `.danger` and `.error` occupy the same intent axis as
`.destructive`; they do not add component behavior. State and modifier classes
such as `.interactive`, `.loading`, `.invalid`, `.compact`, and `.vertical` sit
above this map and are documented with their component.

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
  takes intent, but presentation classes do not affect it.

The removed `--layout-stack-gap` and `--layout-cluster-gap` tokens have no compatibility aliases.

## Content

| Class           | Purpose                                                                                  | Intent affects         |
| --------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| `.table-wrap`   | Full-width horizontal overflow wrapper for wide tables.                                  | Nothing.               |
| `.data-table`   | Rounded nested table styling for captions, heads, footers, cells, and rows.              | Head, border, hover.   |
| `.kbd`          | Inline keyboard-input styling.                                                           | Surface, border, text. |
| `.quote`        | Block quote styling; a nested `cite` is set upright and takes the quotation's own color. | Bar, surface, text.    |
| `.quote-inline` | Inline quotation styling.                                                                | Nothing.               |
| `.code`         | Inline code formatting.                                                                  | Surface.               |
| `.pre`          | Scrollable block code formatting with larger padding.                                    | Surface.               |

A table's rows deliberately inherit its intent instead of resetting it, so
`.data-table.success` tints throughout. A row carrying its own intent still wins:

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

This is the one place intent cascades, because a table's rows are parts of the
table rather than independent components.

`.data-table` and `.kbd` also read [presentation](#presentation). A table applies it
to its header and border, and a key cap to its whole chip:

```html
<table class="data-table success soft edged">...</table>
<kbd class="kbd primary solid">Ctrl</kbd>
<kbd class="kbd primary ghost edged">Shift</kbd>
```

Use `.table-wrap` around `.data-table` when table width may exceed its container:

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

| Class          | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `.card`        | Raised container. Bordered, surface radius, low elevation, padded.       |
| `.panel`       | Flush container for sidebars, toolbars, and wells. No elevation.         |
| `.interactive` | On `.card`. Adds pointer cursor, hover lift, and a focus ring.           |
| `.compact`     | On `.card` or `.panel`. Reduces padding.                                 |
| `.spacious`    | On `.card` or `.panel`. Increases padding.                               |
| `.flush`       | On `.card` or `.panel`. Removes padding, for edge-to-edge content.       |
| `.flat`        | Removes part-based elevation; glass surfaces keep their complete shadow. |

Both read intent, [presentation](#presentation), and
[material tokens](./tokens.md#material-tokens). A plain `.card` is a neutral
bordered container; only an explicit presentation tints it.

```html
<article class="card">Neutral card</article>
<article class="card success soft">Tinted success card</article>
<article class="card primary ghost edged">Intent border, no fill</article>
<a class="card interactive" href="/package">Lifts on hover</a>
<aside class="panel">Flush panel</aside>
```

`.interactive` is styling only. Use a real interactive element and give it an
accessible name; a `<div class="card interactive">` is not focusable or
operable by keyboard.

## Presentation

Presentation has two independent axes. `.solid`, `.soft`, and `.ghost` decide how
much intent fills a component; `.edged` and `.edgeless` decide whether it draws a
boundary. They set [presentation tokens](./tokens.md#presentation-tokens) and
nothing else, so they work on the component itself or on any ancestor:

```html
<div class="soft">
  <button class="btn primary">Soft primary button</button>
  <span class="badge success">Soft success badge</span>
  <button class="btn primary ghost edged">Outlined; the element wins</button>
</div>
```

A declaration on the element always beats one inherited from a container, so a
container sets the default look for its subtree and any element opts out.

| Class       | Look                                                       |
| ----------- | ---------------------------------------------------------- |
| `.solid`    | Intent-colored fill with contrast text.                    |
| `.soft`     | Lightly tinted fill with intent-colored text.              |
| `.ghost`    | No fill at rest, with intent-colored text.                 |
| `.edged`    | Intent-colored boundary at the aesthetic's material width. |
| `.edgeless` | No boundary.                                               |

Values each class ships:

| Class       | `--ui-fill` | `--ui-fg-on-fill` | `--ui-border` |
| ----------- | ----------- | ----------------- | ------------- |
| `.solid`    | `100%`      | `100%`            |               |
| `.soft`     | `12%`       | `0%`              |               |
| `.ghost`    | `0%`        | `0%`              |               |
| `.edged`    |             |                   | `100%`        |
| `.edgeless` |             |                   | `0%`          |

A fill class never decides an edge and an edge class never decides a fill. The
combinations mean exactly what they spell:

```html
<button class="btn primary">Solid, the button default</button>
<button class="btn soft edged">Tinted with a border</button>
<button class="btn primary ghost edged">Outline</button>
<button class="btn ghost">Ghost; picks up a tint on hover</button>
<input class="ipt soft edgeless" />
<!-- A field sunk into the page -->
```

`.solid` is the one pair that collapses. At a full fill the boundary blends all
the way to the box's own background, so `.solid.edged` and `.solid.edgeless`
render the same thing — a filled box ringed in another color is the thing the
blend exists to prevent. Five distinct results from six spellings.

With no presentation class in scope, each component keeps its own default:
buttons are filled, alerts and badges are tinted, surfaces and controls are
neutral and bordered.

| Component                                       | Reads                                       |
| ----------------------------------------------- | ------------------------------------------- |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`   | Fill, text, border, and border width.       |
| `.kbd`                                          | Fill, text, border, and border width.       |
| `.data-table`                                   | Header fill and text, border, border width. |
| `.ipt`, `.textarea`, `.select`, `.text-control` | Border, border width, and a capped fill.    |
| `.checkbox`, `.radio`                           | Capped unchecked fill. The border is fixed. |
| `.switch`                                       | Border, border width, and a capped fill.    |
| `.quote`                                        | Fill, text, border, and width.              |
| `.code`, `.pre`, `.tooltip`                     | Fill, text, border, and material.           |
| `.loader`, `.skeleton`, `.progress`, `.divider` | Intent only, not presentation.              |

Text controls and toggles cap an inherited or `.solid` fill at `6%`, keeping
typed text legible; a switch caps at `40%`, where its three fills separate as
fills. A `.soft` class written directly on a text control takes its published
`12%` tint whole, because that is a consumer naming what they want rather than a
container's cascade reaching a field nobody classed. The same split governs the
edge: a cascaded `.edgeless` is floored, and the element's own is honoured —
except on `.checkbox` and `.radio`, which never drop their line at all.

A tooltip bubble is filled, over a tinted ground. An intent fills it with that
intent's own color: `.tooltip.primary` is the primary color, black on a light
page and white on a dark one, and `.tooltip.destructive` is a red bubble. With no
intent the fill stops at the neutral cap and the ground shows through, so the
bubble is a quiet grey plate in either theme rather than a slab of the page's own
ink. The ground is also what keeps a bubble opaque when a container's
[presentation](#presentation) cascades into one, so a tooltip stays readable over
whatever it floats above at every fill. It reads the material tokens too, so an
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

Aesthetics compose with every supported fill and edge pair. `.ghost.edgeless`
intentionally removes the visible material traits from components whose
aesthetic is expressed only through their fill, edge, or elevation.

An explicit presentation on the element still wins over the aesthetic's
defaults. The aesthetic supplies edge thickness; presentation only decides
whether that edge is drawn.

An aesthetic directly on a component likewise wins over an inherited aesthetic.
This includes tooltip pseudo-elements: `.tooltip.glass` gets the complete glass
bubble under a pixel ancestor, and `.tooltip.pixel` gets the complete stepped
bubble under a glass ancestor.

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

Use `.btn` with one optional intent class, one optional fill class, one optional
edge class, optional size class, and optional state.

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

`.neutral` is the only intent that does not fill all the way. Its color is the
page's own text color, so a full fill of it would be a black or white slab --
the loudest element on the page, for the intent that means nothing in
particular. It stops at `--intent-fill-max`, which is why a `.solid` neutral is
a quiet plate a step past `.soft` rather than a block of ink. Set the slot on
your own intent classes; see [intent tokens](./tokens.md#intent-tokens).

Size and shape classes:

| Class                                                                  | Purpose                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `.pill`                                                                | Fully rounded button corners (`border-radius: 9999px`).     |
| `.sm`                                                                  | Smaller button.                                             |
| `.lg`                                                                  | Larger button.                                              |
| `.p-sm`, `.compact`                                                    | Compact padding modifier (`px-2.5 py-1`).                   |
| `.p-lg`, `.spacious`                                                   | Spacious padding modifier (`px-6 py-3`).                    |
| `.icon`                                                                | Square icon button. Use an accessible name in HTML.         |
| `.loading`                                                             | Loading state. Hides text and shows CSS activity indicator. |
| `.disabled`, `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` | Disabled styling.                                           |

Examples:

```html
<button class="btn primary">Primary</button>
<button class="btn success ghost edged">Success outline</button>
<button class="btn warning soft">Warning soft</button>
<button class="btn destructive ghost edgeless">Danger ghost</button>
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
| `.hint.error`                                                         | Helper text with destructive intent.                            |
| `.text-control`                                                       | Shared public text-control composition utility.                 |
| `.ipt`                                                                | Input control styling.                                          |
| `.ipt.icon`                                                           | Opts-in to displaying an input icon.                            |
| `.left` / `.right` (on `.ipt.icon` or native inputs)                  | Icon alignment (left by default).                               |
| `.email`, `.password`, `.url`, `.tel`, `.search`, `.date`, etc.       | Input type icon selectors (class or matching `type` attribute). |
| `.textarea`                                                           | Textarea control styling.                                       |
| `.select`                                                             | Select control styling.                                         |
| `input[type="checkbox"].checkbox`                                     | Custom checkbox control styling.                                |
| `input[type="radio"].radio`                                           | Custom radio control styling.                                   |
| `input[type="checkbox"].switch`                                       | Custom switch control styling.                                  |
| `[aria-invalid="true"]` on controls                                   | Destructive border and focus color.                             |
| `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` on controls | Disabled styling.                                               |

`.ipt` input icons are opt-in via `.icon` (e.g. `<input class="ipt email icon left">`).
Native inputs mapped in `native.css` get the same icon source from their type, and the same opt-in: the artwork is drawn only where the element also carries `.icon`.

`date` and `datetime-local` depend on the engine, because their picker button is the one browsers do not all let a stylesheet hide. Where it can be hidden, the type opts itself into `.icon` and shows the themed calendar in its place. Where it cannot, the native button stays and no custom icon is drawn, since two calendar glyphs on one field read as a defect. `.icon`, `.left`, and `.right` are inert on these two types in that case rather than reserving space for artwork that never paints.
Native WebKit search decorations are suppressed on `search` inputs to prevent placeholder overlap when `.icon` is omitted.

An input icon is a `background-image` on the control itself, so a field that
wants one needs no wrapper element around it.

```html
<label class="field">
  <span class="label">Email</span>
  <input class="ipt email icon" type="email" />
</label>
```

A `data:` URI is a document of its own and inherits nothing from the page, so the
artwork can read neither `currentColor` nor a custom property and each glyph
ships a light and a dark copy that a theme selector picks between. That is the
one place in the package where a theme is chosen by selector rather than
resolved by `light-dark()` at the point of use, because `light-dark()` takes
colors and these are images.

`--ipt-icon-src` on the control replaces the artwork with any image.

```html
<input class="ipt icon" style="--ipt-icon-src: url('/icons/user.svg')" />
```

`.checkbox`, `.radio`, and `.switch` accept the same intent classes as buttons
to set the checked color:

| Class                               | Meaning                 |
| ----------------------------------- | ----------------------- |
| `.neutral` _(default)_              | Text color, capped.     |
| `.primary`                          | Primary color.          |
| `.secondary`                        | Secondary/accent color. |
| `.success`                          | Success color.          |
| `.warning`                          | Warning color.          |
| `.destructive`, `.danger`, `.error` | Destructive color.      |
| `.info`                             | Info color.             |

A switch rests at `.solid`, where the other two rest at `.ghost`, and its three
fills are told apart by the tint like every other component's: it caps at `40%`
rather than `6%`, so `.solid` is a filled track, `.soft` a light one and `.ghost`
the knob alone. All three keep their line. The checked track is the same filled
shape under all three, and sits well clear of an unchecked `.solid`.

A checked checkbox and a checked switch fill with the intent and cut their mark
out of it. A checked radio does not fill: it takes a ring twice the resting line
weight and a dot, both in the intent color, because a filled circle with a dot of
the same color inside it is a disc.

Text controls also take intent, which colors the resting border and the
focus-visible border, and both presentation axes. `.ghost` fills nothing, `.soft`
takes its published `12%` tint whole, and `.solid` is a quieter wash at the `6%`
cap — the cap governs `.solid` and the container that cascades one onto an
unclassed field, where `.soft` on the element names the tint it wants. None of
them touches the line.

The boundary is the edge axis's, and it splits the same way. A container's
`.edgeless` is floored, so a toolbar cannot leave a field with no mark of where
typing goes. `.edgeless` on the control itself is honoured, which is how the
borderless field is spelled — it does not meet WCAG 1.4.11 at rest, so it is
opt-in and never a default, and the focus ring still shows.

```html
<input class="ipt success" placeholder="Valid" />
<input class="ipt ghost edged" placeholder="Outlined" />
<input class="ipt soft edged" placeholder="Tinted with a border" />
<input class="ipt soft edgeless" placeholder="Sunk into the page" />
<div class="soft">
  <input class="ipt" placeholder="Tinted from the container, capped at 6%" />
</div>
<div class="edgeless">
  <input class="ipt" placeholder="Keeps its line; the floor holds" />
</div>
```

`.text-control` is a public low-level utility from the form entrypoint. It
provides the shared control dimensions, border, placeholder, focus-visible,
invalid, and disabled styles composed by `ipt`, `textarea`, and `select`. Use it
for custom text-like controls; prefer those higher-level utilities when they fit.

Example:

```html
<label class="field">
  <span class="label">Email</span>
  <input class="ipt email icon" type="email" aria-invalid="true" aria-describedby="email-error" />
  <span class="hint error" id="email-error">Enter a valid email.</span>
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
| `.loader-mask`   | Low-level activity indicator composition utility. Applies the spinner mask.  |
| `.loader`        | Standalone inline loader artwork.                                            |
| `.skeleton`      | Ambient loading placeholder.                                                 |
| `.progress`      | Progress track. Uses `--progress-value` variable.                            |
| `.active`        | Optional on `.progress` to add a track shimmer.                              |
| `.indeterminate` | Optional on `.progress` to animate a moving fill without `--progress-value`. |

Activity indicator modifier classes compose with `.loader`:

| Class                  | Animation style                         |
| ---------------------- | --------------------------------------- |
| _(default)_            | Circular spinner (rotating arc).        |
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

Skeletons, loaders, progress bars, and dividers are indicators. They read intent
but ignore fill and edge presentation.

```html
<span class="loader success" aria-hidden="true"></span>
<span class="skeleton info"></span>
```

`.icon` is a subclass of `.alert`. When applied as `.alert.icon`, it increases
the left padding and adds an embedded SVG. Success, warning, and destructive
intents use corresponding symbols; other intents use the information symbol.

Alerts and badges read the shared [presentation](#presentation) classes. Without
one they use a tinted surface, intent-colored text, and a mixed intent border.

Examples:

```html
<div class="alert success" role="status">Saved successfully.</div>
<div class="alert primary solid" role="status">Deployment started.</div>
<div class="alert warning soft icon" role="status">Review required.</div>
<div class="alert destructive ghost edged" role="alert">Deployment failed.</div>
<span class="badge warning">Queued</span>
<span class="badge success solid">Live</span>
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
