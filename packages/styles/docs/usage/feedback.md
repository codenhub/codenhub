---
title: Feedback
description: Alert, badge, skeleton, and progress class reference.
order: 7
---

# Feedback

| Class            | Purpose                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `.alert`         | Inline feedback surface.                                                     |
| `.alert-icon`    | Sizing and alignment for an icon element dropped in as a child of `.alert`.  |
| `.badge`         | Compact status pill.                                                         |
| `.skeleton`      | Ambient loading placeholder.                                                 |
| `.progress`      | Progress track. Uses `--progress-value` variable.                            |
| `.active`        | Optional on `.progress` to add a track shimmer.                              |
| `.indeterminate` | Optional on `.progress` to animate a moving fill without `--progress-value`. |

The package ships no spinner. Bring one from an icon set, such as `@codenhub/icons`: a glyph with `ic-anim-spin` (`ic-lucide-loader-circle ic-anim-spin`), or the animated `svg-spinners` family. A `currentColor` icon matches the text around it. `ic-anim-spin` stops under `prefers-reduced-motion: reduce`; `svg-spinners` artwork keeps moving. See [Accessibility](../accessibility.md).

This package does not import an icon set. Install `@codenhub/icons` and load it for your pipeline, as its README describes: after Tailwind, `@import "@codenhub/icons/tw";`; in plain CSS, the base rules and each family you use:

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

Alerts, badges, progress bars, and skeletons accept `.primary`, `.secondary`, `.success`, `.warning`, `.destructive`, and `.info`. Without an intent, alerts and badges use the text palette, while the indicators -- `.skeleton` and `.progress` -- take `currentColor`, so they match whatever content surrounds them.

Skeletons and dividers are indicators: they read intent but ignore fill and edge [presentation](./composing.md#presentation). `.progress` is not one of them — its track reads both, `.soft.edgeless` by default; only the moving value fill stays intent-colored at full strength regardless of presentation. `.solid` is unsupported on the track, and `.ghost.edgeless` renders but is discouraged, since neither leaves the track a visible frame. See [Composing → Component axis reference](./composing.md#component-axis-reference) for the full table.

```html
<span class="skeleton info"></span>
```

The package ships no icon of its own: `.alert` is already `flex`, so an icon dropped in as a child is spaced from the message by its `gap-3`. `.alert-icon` only sizes and aligns whatever icon element you provide — an inline `<svg>`, an `<img>`, or a class from an icon set such as `@codenhub/icons` — the same contract [`.input-group`](./forms.md#icons) documents.

`.alert-icon` sizes the icon to `1.25rem`. A `@codenhub/icons` glyph sizes itself in an unlayered rule that no class of this package can outrank, so `.alert-icon` sets that set's `--ic-size` as well; an icon set with a different prefix keeps its own size unless you set its knob. Resize an alert icon with an ordinary rule of your own, and set `--ic-size` along with `width` and `height` for a `@codenhub/icons` glyph.

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
<div class="progress" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64" style="--progress-value: 64%"></div>
<div class="progress secondary active" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64" style="--progress-value: 64%"></div>
<div class="progress primary ghost edged" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64" style="--progress-value: 64%"></div>
<div class="progress info indeterminate" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"></div>
```

Add `role="status"` or `role="alert"` to alerts based on announcement urgency, mark decorative loading visuals with `aria-hidden="true"`, and use semantic progress elements or ARIA values when numeric progress must be announced; see [Accessibility](../accessibility.md).
