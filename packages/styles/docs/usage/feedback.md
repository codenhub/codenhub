---
title: Feedback
description: Alert, badge, loader, skeleton, and progress class reference.
---

# Feedback

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
`prefers-reduced-motion: reduce`, loader CSS substitutes a corresponding
static mask. This fallback is part of focused loader, button, and components
imports; it does not depend on the global reset. See
[Accessibility](../accessibility.md).

Loader size modifiers:

| Class    | Size              |
| -------- | ----------------- |
| _(none)_ | Default (`2rem`). |
| `.sm`    | Small (`1.5rem`). |
| `.lg`    | Large (`2.5rem`). |

Alerts, badges, progress bars, skeletons, and loaders accept `.primary`,
`.secondary`, `.success`, `.warning`, `.destructive`, `.danger`, `.error`,
and `.info`. Without an intent, they use the text palette, except `.loader`,
which keeps `currentColor` so it matches whatever content surrounds it.

Skeletons, loaders, progress bars, and dividers are indicators. They read
intent but ignore fill and edge [presentation](./composing.md#presentation).

```html
<span class="loader success" aria-hidden="true"></span>
<span class="skeleton info"></span>
```

`.icon` is a subclass of `.alert`. When applied as `.alert.icon`, it
increases the left padding and adds an embedded SVG. Success, warning, and
destructive intents use corresponding symbols; other intents use the
information symbol.

Alerts and badges read the shared [presentation](./composing.md#presentation)
classes. Without one they use a tinted surface, intent-colored text, and a
mixed intent border.

## Example

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

Add `role="status"` or `role="alert"` to alerts based on announcement
urgency, mark decorative loading visuals with `aria-hidden="true"`, and use
semantic progress elements or ARIA values when numeric progress must be
announced; see [Accessibility](../accessibility.md).
