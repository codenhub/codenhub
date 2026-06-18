# @codenhub/styles Classes

**Status:** IMPLEMENTED
**Last updated:** 2026-06-18
**Scope:** Public helper classes for `@codenhub/styles`.

Helper classes are CSS-only. They provide presentation and state styling, not semantics or behavior.

## Layout

| Class                                             | Purpose                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `.sect`                                           | Responsive section wrapper with centered column layout and page gutters. |
| `.sect-container`                                 | Centered section container using `--container-max`.                      |
| `.sect-inn`                                       | Section inner container using the same behavior as `.sect-container`.    |
| `.sect-container.narrow`, `.sect-inn.narrow`      | Use `--container-narrow`.                                                |
| `.sect-container.wide`, `.sect-inn.wide`          | Use `--container-wide`.                                                  |
| `.left`, `.right`, `.center` on container helpers | Align container contents.                                                |
| `.stack`                                          | Vertical flex stack using `--layout-stack-gap`.                          |
| `.stack.tight`                                    | Smaller stack gap.                                                       |
| `.stack.loose`                                    | Larger stack gap.                                                        |
| `.cluster`                                        | Wrapping horizontal flex cluster using `--layout-cluster-gap`.           |
| `.cluster.between`                                | Cluster with `space-between` alignment.                                  |
| `.auto-grid`                                      | Responsive auto-fit grid using `--layout-grid-min`.                      |

## Surfaces

| Class                                                   | Purpose                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `.card`                                                 | Raised content surface with border, radius, padding, shadow, and column layout. |
| `.panel`                                                | Subtle foreground surface with the same structure as `.card`.                   |
| `.card.interactive`, `.panel.interactive`               | Adds pointer cursor and hover affordance.                                       |
| `.card[data-state="open"]`, `.panel[data-state="open"]` | Applies open-state border/affordance.                                           |
| `.empty-state`                                          | Centered empty-state layout with muted color.                                   |

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
| `.loading`                                                             | Loading state. Hides text and shows CSS spinner.                              |
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
| `.error` inside `.field` except `.btn.error`, `.field-error`          | Destructive helper text.            |
| `.ipt`                                                                | Input control styling.              |
| `.textarea`                                                           | Textarea control styling.           |
| `.select`                                                             | Select control styling.             |
| `input[type="checkbox"].checkbox`                                     | Custom checkbox control styling.    |
| `input[type="checkbox"].switch`                                       | Custom switch control styling.      |
| `[aria-invalid="true"]` on controls                                   | Destructive border and focus color. |
| `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` on controls | Disabled styling.                   |

`.checkbox` and `.switch` accept the same intent classes as buttons to set the checked color:

| Class                               | Meaning            |
| ----------------------------------- | ------------------ |
| _(default)_                         | Primary color.     |
| `.success`                          | Success color.     |
| `.warning`                          | Warning color.     |
| `.destructive`, `.danger`, `.error` | Destructive color. |
| `.info`                             | Info color.        |

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
  <input type="checkbox" class="switch destructive" />
  <span>Enable</span>
</label>
```

`.progress` also accepts the same intent classes to color the fill bar:

## Feedback

| Class       | Purpose                                                             |
| ----------- | ------------------------------------------------------------------- |
| `.alert`    | Inline feedback surface.                                            |
| `.icon`     | Subclass of `.alert`. Adds a corresponding intent icon and padding. |
| `.badge`    | Compact status pill.                                                |
| `.spinner`  | Inline loading spinner.                                             |
| `.skeleton` | Ambient loading placeholder.                                        |
| `.progress` | Progress track. Fill element uses `--progress-value`.               |

Feedback helpers accept the same intent classes as buttons: `.success`, `.warning`, `.destructive`, `.danger`, `.error`, and `.info`.

`.icon` is a subclass of `.alert`. When applied as `.alert.icon`, it increases the left padding and adds an embedded SVG icon matching the alert's intent (success, warning, error, info).

`.badge` also accepts presentation variant classes:

| Class    | Purpose                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| _(none)_ | Default. Tinted surface, intent-colored text, subtle intent-tinted border.         |
| `.flat`  | Filled with the intent color; uses contrast text. Border matches the intent color. |
| `.soft`  | Tinted surface and intent-colored text with no border (border is transparent).     |

Examples:

```html
<div class="alert success" role="status">Saved successfully.</div>
<div class="alert success icon" role="status">Saved successfully with icon.</div>
<span class="badge warning">Queued</span>
<span class="badge success flat">Live</span>
<span class="badge info soft">Draft</span>
<span class="spinner" aria-hidden="true"></span>
<div class="progress" aria-label="Upload progress"><span style="--progress-value: 64%"></span></div>
<div class="progress success" aria-label="Upload progress"><span style="--progress-value: 64%"></span></div>
```

## Tooltips

| Class or Attribute                 | Purpose                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| `.tooltip`                         | Tooltip host. Uses `data-tooltip` as pseudo-element content. |
| `.tooltip.icon`                    | Circular icon-style tooltip host.                            |
| `[data-tooltip-position="top"]`    | Positions tooltip above host.                                |
| `[data-tooltip-position="bottom"]` | Positions tooltip below host.                                |
| `[data-tooltip-position="left"]`   | Positions tooltip left of host.                              |
| `[data-tooltip-position="right"]`  | Positions tooltip right of host.                             |
| No `data-tooltip-position`         | Defaults to top placement.                                   |
| `[data-state="open"]`              | Shows tooltip without hover.                                 |

Example:

```html
<button class="tooltip icon" data-tooltip="More details" data-tooltip-position="right" aria-label="More details">
  ?
</button>
```

CSS pseudo-element tooltips are presentational. They are not a complete accessible tooltip implementation by themselves.

## Typography Utilities

| Class            | Purpose                        |
| ---------------- | ------------------------------ |
| `.text-display`  | Large display headings.        |
| `.text-title-lg` | Large section titles.          |
| `.text-title`    | Default section titles.        |
| `.text-title-sm` | Smaller titles or card titles. |
| `.text-label-lg` | Large label text.              |
| `.text-label`    | Default label text.            |
| `.text-body`     | Default body copy.             |
