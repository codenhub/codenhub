---
title: Feedback
description: A saving button, alerts, badges, loading placeholders, and progress bars, and what your code must keep in sync with them.
order: 3
---

# Feedback

The profile form can be submitted, but nothing tells the user what happened. This page adds the screen's feedback: a Save button that shows it is working, an alert when the save succeeds, a badge on the plan card, a placeholder while the profile loads, and bars for storage use and a data export. The package draws each of these; your code decides when they appear, updates their values, and makes sure screen readers hear about them.

## Show that the form is saving

There is no loading class. A saving button is a disabled button with a spinning icon:

```html
<button class="btn primary" type="submit" disabled>
  <i class="ic-lucide-loader-circle ic-anim-spin" aria-hidden="true"></i>
  Saving…
</button>
```

The spinner comes from `@codenhub/icons`, which this package does not load. Load it once, as [Buttons → Loading icons](./buttons.md#loading-icons) shows; with compiled CSS that is:

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

`ic-anim-spin` rotates the icon and stops when the user asks the system for reduced motion. The animated `svg-spinners` family in `@codenhub/icons` is different: its artwork keeps moving under that preference. Either icon takes the button's text color.

Disabling the button stops a second click from submitting twice. Whether to keep or replace the label is up to you; the package has no way to hide it. A changing button label is not reliably announced, so tell screen reader users the outcome with a status message, as the next section does.

## Confirm the result with an alert

When the save succeeds, show an alert above the form:

```html
<div class="alert success" role="status">Profile saved.</div>
```

`role="status"` makes screen readers announce the text politely, after what they are reading. For an error the user must act on, use `role="alert"`, which interrupts:

```html
<div class="alert destructive" role="alert">Your changes were not saved. Check your connection and try again.</div>
```

Screen readers announce a live region when its content changes, so render the region empty when the page loads and put the message into it, rather than inserting a new alert element with the text already inside. The package adds no role, timing, or dismiss button; those are yours.

An alert is a row with a 0.75rem gap, so an icon placed before the message is spaced automatically. `.alert-icon` sizes an icon to 1.25rem and aligns it with the first line of text:

```html
<div class="alert warning" role="status">
  <i class="alert-icon ic-lucide-triangle-alert" aria-hidden="true"></i>
  Your card expires next month. Update it to keep your plan.
</div>
```

Any icon element works: a class from an icon set, an inline `<svg>`, or an `<img>`. `@codenhub/icons` sizes its glyphs in a rule no class can outrank, so `.alert-icon` also sets that set's `--ic-size`. To resize an alert icon, write your own rule that sets `width`, `height`, and, for `@codenhub/icons`, `--ic-size`.

### How alerts look

With no presentation class, an alert is soft and edged: a light tint of its intent, intent-colored text, and a border. Presentation classes change that like on any component, such as `.alert.primary.solid` for a filled banner.

An alert with no intent is an exception. It has no tint at rest; it uses `--color-foreground`, the quiet background tone one step off the page, the same as a neutral `.card.soft` or `.panel`. An alert with `.primary`, `.secondary`, `.success`, `.warning`, `.destructive`, or `.info` keeps its tint. Only those six classes count here: an alert with an intent class you defined yourself is treated as having no intent; see [Theming → Your own intent](./theming.md#your-own-intent).

## Label the plan with a badge

A badge is a small pill for a status or a count:

```html
<section class="card soft primary stack tight" aria-labelledby="plan-title">
  <div class="cluster between">
    <h2 class="text-label" id="plan-title">Current plan</h2>
    <span class="badge success">Active</span>
  </div>
  <p class="text-title-sm">Team, billed yearly</p>
</section>
```

A badge is soft with no border by default, and takes the same intent and presentation classes as a button: `.badge.warning` for "Payment due", `.badge.info.solid` for a filled "New". Unlike an alert, a badge with no intent keeps its light tint, because it has no border, and without the tint it would disappear into the text around it.

## Show a placeholder while loading

While the profile card waits for data, show gray blocks where the text will be:

```html
<section class="card stack" aria-busy="true" aria-labelledby="profile-title">
  <h2 class="text-title-sm" id="profile-title">Profile</h2>
  <p class="visually-hidden">Loading your profile…</p>
  <div class="stack tight" aria-hidden="true">
    <div class="skeleton" style="height: 2.5rem"></div>
    <div class="skeleton" style="width: 60%"></div>
  </div>
</section>
```

A `.skeleton` fills the width of its container and is at least 1rem tall. It has no size or shape of its own: use a block element such as a `<div>`, and set its width and height to match the content it stands in for. An empty inline element such as `<span class="skeleton">` has no size and does not appear.

A skeleton takes an intent but ignores presentation. With no intent, it uses `currentColor`, so it matches the text around it. It shows a moving shimmer that stops when the user asks for reduced motion.

Mark the blocks `aria-hidden="true"`, because they mean nothing to a screen reader. Say that the content is loading in text instead, as the visually hidden paragraph does, and remove `aria-busy` once the content is in place.

## Show progress

The storage card shows how much space is used, and the danger zone's "Export data first" button starts an export that takes a while. Both are `.progress` bars:

```html
<div class="progress" role="meter" aria-label="Storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="48" aria-valuetext="48 GB of 100 GB" style="--progress-value: 48%"></div>

<div class="progress primary" role="progressbar" aria-label="Export progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20" style="--progress-value: 20%"></div>
```

`--progress-value` is the width of the filled part, as a percentage of the track. It is 0% when unset.

- **Write it with `%`.** `--progress-value: 48` without a unit is not a valid width, and the bar shows empty.
- **Nothing is clamped or checked.** Above 100%, the fill is cut off at the end of the track and looks full; a negative value is not a valid width either. Keep the value between 0% and 100% in your code.
- **The visual value and the announced value are separate.** The bar's width comes from `--progress-value`; what a screen reader announces comes from `aria-valuenow`. The package does not connect them, so update both together.

```js
function setExportProgress(bar, percent) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  bar.classList.remove("indeterminate");
  bar.style.setProperty("--progress-value", `${value}%`);
  bar.setAttribute("aria-valuenow", String(value));
}
```

When you do not know how far along the work is, such as while the export is being prepared, use `.indeterminate`. A third of the track slides back and forth, and `--progress-value` is ignored. Remove `aria-valuenow`, because there is no known value to announce:

```html
<div class="progress primary indeterminate" role="progressbar" aria-label="Preparing export"></div>
```

`.active` adds a shimmer over the track of a determinate bar, to show that work is still happening between updates. Both animations stop when the user asks for reduced motion; an indeterminate bar then rests with its fill at the start.

### How progress bars look

The fill is the intent color at full strength, or `currentColor` with no intent. The track is soft and edgeless by default: a light tint with no border.

The default track is faint. Against the page it measures about 1.1:1 to 1.3:1, below the 3:1 that WCAG 1.4.11 asks of the parts of a graphic needed to understand it. When the track's extent matters, use `.ghost.edged`, which draws an outline around it; [Accessibility → Control boundaries](../accessibility.md#control-boundaries) has the measurements. `.solid` is not supported on the track, because the fill and the track would be the same color. `.ghost.edgeless` renders, but leaves the track with no visible frame.

To change the colors of the fill, the track, or its border without changing the intent, set `--progress-color`, `--progress-surface`, or `--progress-edge` on the bar or any element around it. They and `--progress-value` are listed in [Customizing → Component variables](./customizing.md#component-variables).

## Animation that keeps running

Skeletons, `.active` shimmers, indeterminate bars, and spinners animate for as long as they are on the page. The package stops its own animations when the user asks the system for reduced motion, but that is not the only requirement. WCAG 2.2.2 asks that motion which starts automatically, lasts more than five seconds, and is shown alongside other content can be paused, stopped, or hidden by the user, unless the motion is essential.

A loading indicator shown while the user cannot do anything else, and that would confuse them if it were missing, counts as essential. A shimmer or spinner that keeps moving next to content the user is working with, such as a decorative "live" shimmer on a card, does not. Remove those as soon as their work is done, or give the user a control that stops them.

## Next

The screen now reports what it is doing. [Tooltips](./tooltips.md) adds short help text beside a form field.
