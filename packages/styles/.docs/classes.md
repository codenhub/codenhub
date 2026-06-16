# @codenhub/styles Classes

**Status:** IMPLEMENTED
**Last updated:** 2026-06-16
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

| Class                                                                  | Purpose                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `.outline`                                                             | Transparent button with intent companion-tone border and text.            |
| `.ghost`                                                               | Transparent button with intent companion-tone text and soft hover.        |
| `.soft`                                                                | Low-emphasis filled button using intent companion surface and text tones. |
| `.pill`                                                                | Fully rounded button corners (`border-radius: 9999px`).                   |
| `.fill` with `.outline`                                                | Filled hover treatment for outline buttons.                               |
| `.sm`                                                                  | Smaller button.                                                           |
| `.lg`                                                                  | Larger button.                                                            |
| `.icon`                                                                | Square icon button. Use an accessible name in HTML.                       |
| `.loading`                                                             | Loading state. Hides text and shows CSS spinner.                          |
| `.disabled`, `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` | Disabled styling.                                                         |

Examples:

```html
<button class="btn primary">Primary</button>
<button class="btn success outline">Success outline</button>
<button class="btn warning soft">Warning soft</button>
<button class="btn destructive ghost">Danger ghost</button>
<button class="btn icon primary" aria-label="Create">+</button>
<button class="btn primary loading" disabled>Saving</button>
```

`.loading` is a state, not a color or presentation class. Prefer combining it with disabled behavior so users cannot trigger duplicate work.

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
| `[aria-invalid="true"]` on controls                                   | Destructive border and focus color. |
| `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]` on controls | Disabled styling.                   |

Example:

```html
<label class="field">
  <span class="label">Email</span>
  <input class="ipt" type="email" aria-invalid="true" aria-describedby="email-error" />
  <span class="error" id="email-error">Enter a valid email.</span>
</label>
```

## Feedback

| Class       | Purpose                                               |
| ----------- | ----------------------------------------------------- |
| `.alert`    | Inline feedback surface.                              |
| `.banner`   | Full-width feedback strip. No side borders.           |
| `.toast`    | Fixed overlay feedback surface.                       |
| `.badge`    | Compact status pill.                                  |
| `.spinner`  | Inline loading spinner.                               |
| `.skeleton` | Ambient loading placeholder.                          |
| `.progress` | Progress track. Fill element uses `--progress-value`. |

Feedback helpers accept the same intent classes as buttons: `.success`, `.warning`, `.destructive`, `.danger`, `.error`, and `.info`.

`.banner` extends `.alert` with `border-radius: 0` and removes side borders, making it suitable for full-width application-level feedback strips. `.toast` uses `--elevation-overlay` for its shadow.

Examples:

```html
<div class="alert success" role="status">Saved successfully.</div>
<div class="banner warning" role="status">Your session expires in 5 minutes.</div>
<div class="toast info" role="status">Ready.</div>
<span class="badge warning">Queued</span>
<span class="spinner" aria-hidden="true"></span>
<div class="progress" aria-label="Upload progress"><span style="--progress-value: 64%"></span></div>
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
