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
- `.divider` is horizontal; `.vertical` makes it self-stretch vertically.

The removed `--layout-stack-gap` and `--layout-cluster-gap` tokens have no compatibility aliases.

## Content

| Class           | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `.table-wrap`   | Full-width horizontal overflow wrapper for wide tables.                     |
| `.table`        | Rounded nested table styling for captions, heads, footers, cells, and rows. |
| `.kbd`          | Inline keyboard-input styling.                                              |
| `.quote`        | Block quote styling; nested `cite` elements receive attribution styling.    |
| `.quote-inline` | Inline quotation styling.                                                   |
| `.code`         | Inline code formatting.                                                     |
| `.pre`          | Scrollable block code formatting with larger padding.                       |

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

| Class          | Purpose                                       |
| -------------- | --------------------------------------------- |
| `.empty-state` | Centered empty-state layout with muted color. |

## Buttons

Use `.btn` with one optional intent class, one optional presentation class, optional size class, and optional state.

Intent classes map color tokens into button tone slots. Presentation classes own how those slots become background, text, border, hover, and spinner styles.

Intent classes:

| Class                               | Meaning                        |
| ----------------------------------- | ------------------------------ |
| `.primary`                          | Primary action.                |
| `.secondary`                        | Secondary/accent action.       |
| `.success`                          | Successful or positive action. |
| `.warning`                          | Warning/caution action.        |
| `.destructive`, `.danger`, `.error` | Destructive or error action.   |
| `.info`                             | Informational action.          |

Presentation and size classes:

| Class                                                                  | Purpose                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `.out`                                                                 | Transparent button with intent readable-tone border and text.                 |
| `.ghost`                                                               | Transparent button with intent readable-tone text and soft hover.             |
| `.soft`                                                                | Low-emphasis filled button using intent subtle surface and strong text tones. |
| `.pill`                                                                | Fully rounded button corners (`border-radius: 9999px`).                       |
| `.fill` with `.out`                                                    | Filled hover treatment using intent color and contrast text.                  |
| `.sm`                                                                  | Smaller button.                                                               |
| `.lg`                                                                  | Larger button.                                                                |
| `.icon`                                                                | Square icon button. Use an accessible name in HTML.                           |
| `.loading`                                                             | Loading state. Hides text and shows CSS activity indicator.                   |
| `.disabled`, `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` | Disabled styling.                                                             |

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

| Class or Selector                                                     | Purpose                             |
| --------------------------------------------------------------------- | ----------------------------------- |
| `.field`                                                              | Vertical field wrapper.             |
| `.label`                                                              | Form label text.                    |
| `.hint`                                                               | Secondary helper text.              |
| `.error` inside `.field` except `.btn.error`                          | Destructive helper text.            |
| `.control-base`                                                       | Shared public text-control styling. |
| `.ipt`                                                                | Input control styling.              |
| `.textarea`                                                           | Textarea control styling.           |
| `.select`                                                             | Select control styling.             |
| `input[type="checkbox"].checkbox`                                     | Custom checkbox control styling.    |
| `input[type="radio"].radio`                                           | Custom radio control styling.       |
| `input[type="checkbox"].switch`                                       | Custom switch control styling.      |
| `[aria-invalid="true"]` on controls                                   | Destructive border and focus color. |
| `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` on controls | Disabled styling.                   |

`.checkbox`, `.radio`, and `.switch` accept the same intent classes as buttons
to set the checked color:

| Class                               | Meaning                 |
| ----------------------------------- | ----------------------- |
| _(default)_                         | Text color.             |
| `.primary`                          | Primary color.          |
| `.secondary`                        | Secondary/accent color. |
| `.success`                          | Success color.          |
| `.warning`                          | Warning color.          |
| `.destructive`, `.danger`, `.error` | Destructive color.      |
| `.info`                             | Info color.             |

`.control-base` is a public low-level utility from the form entrypoint. It
provides the shared control dimensions, border, placeholder, focus-visible,
invalid, and disabled styles composed by `ipt`, `textarea`, and `select`. Use it
for custom text-like controls; prefer those higher-level utilities when they fit.

Example:

```html
<label class="field">
  <span class="label">Email</span>
  <input class="ipt" type="email" aria-invalid="true" aria-describedby="email-error" />
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

Alerts, badges, and progress bars accept `.primary`, `.secondary`, `.success`,
`.warning`, `.destructive`, `.danger`, `.error`, and `.info`. Without an intent,
they use the text palette.

`.icon` is a subclass of `.alert`. When applied as `.alert.icon`, it increases
the left padding and adds an embedded SVG. Success, warning, and destructive
intents use corresponding symbols; other intents use the information symbol.

Alerts accept presentation variant classes:

| Class          | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| _(none)_       | Tinted surface, intent-colored text, and mixed intent border.     |
| `.flat`        | Intent-color fill and border with contrast text.                  |
| `.soft`        | Tinted surface and intent-colored text with a transparent border. |
| `.left-accent` | Tinted surface with only a four-pixel intent-colored left border. |

Badges accept presentation variant classes:

| Class    | Purpose                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| _(none)_ | Default. Tinted surface, intent-colored text, subtle intent-tinted border.         |
| `.flat`  | Filled with the intent color; uses contrast text. Border matches the intent color. |
| `.soft`  | Tinted surface and intent-colored text with no border (border is transparent).     |

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
