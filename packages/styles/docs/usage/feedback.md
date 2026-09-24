---
title: Feedback
description: Alert, badge, loader, skeleton, and progress class reference.
order: 7
---

# Feedback

| Class            | Purpose                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `.alert`         | Inline feedback surface.                                                     |
| `.alert-icon`    | Sizing and alignment for an icon element dropped in as a child of `.alert`.  |
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

These variants retain their embedded SVG animations normally. Under `prefers-reduced-motion: reduce`, loader CSS substitutes a corresponding static mask. This fallback is part of focused loader, button, and components imports; it does not depend on the global reset. See [Accessibility](../accessibility.md).

Loader size modifiers:

| Class    | Size                 |
| -------- | -------------------- |
| _(none)_ | Default (`1.75rem`). |
| `.sm`    | Small (`1.25rem`).   |
| `.lg`    | Large (`2.25rem`).   |

Alerts, badges, progress bars, skeletons, and loaders accept `.primary`, `.secondary`, `.success`, `.warning`, `.destructive`, and `.info`. Without an intent, they use the text palette, except `.loader`, which keeps `currentColor` so it matches whatever content surrounds it.

Skeletons, loaders, and dividers are indicators: they read intent but ignore fill and edge [presentation](./composing.md#presentation). `.progress` is not one of them — its track reads both, `.soft.edgeless` by default; only the moving value fill stays intent-colored at full strength regardless of presentation. `.solid` is unsupported on the track, and `.ghost.edgeless` renders but is discouraged, since neither leaves the track a visible frame. See [Composing → Component axis reference](./composing.md#component-axis-reference) for the full table.

```html
<span class="loader success" aria-hidden="true"></span> <span class="skeleton info"></span>
```

The package ships no icon of its own: `.alert` is already `flex`, so an icon dropped in as a child is spaced from the message by its `gap-3` with nothing to trigger. `.alert-icon` only sizes and aligns whatever icon element you provide — an inline `<svg>`, an `<img>`, or a class from an icon set such as `@codenhub/icons` — the same contract [`.input-group`](./forms.md#icons) documents.

Alerts and badges read the shared [presentation](./composing.md#presentation) classes. Without one they use a tinted surface, intent-colored text, and a mixed intent border -- except a neutral `.alert` (no named intent), which rests untinted instead, the same no-named-intent carve-out `.card.soft` and `.panel` use: a plain `--color-foreground` plate rather than 12% of near-black ink over the page. A named intent (`.alert.success`, `.alert.destructive`, and so on) keeps its ordinary tint. `.badge` is unaffected either way -- it has no border to fall back on at rest, so untinting it would make a neutral badge disappear rather than read quieter.

## Example

```html
<div class="alert success" role="status">Saved successfully.</div>
<div class="alert primary solid" role="status">Deployment started.</div>
<div class="alert warning soft" role="status">
  <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
  Review required.
</div>
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
<div class="progress" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64" style="--progress-value: 64%"></div>
<div class="progress secondary active" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64" style="--progress-value: 64%"></div>
<div class="progress primary ghost edged" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64" style="--progress-value: 64%"></div>
<div class="progress info indeterminate" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"></div>
```

Add `role="status"` or `role="alert"` to alerts based on announcement urgency, mark decorative loading visuals with `aria-hidden="true"`, and use semantic progress elements or ARIA values when numeric progress must be announced; see [Accessibility](../accessibility.md).
