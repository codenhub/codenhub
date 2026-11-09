---
title: Forms
description: Labeled fields, hints and errors, icons and fixed prefixes, selects, and checkbox, radio, and switch toggles.
order: 2
---

# Forms

The profile card has a Save button but nothing to save. This page fills it in: a display name with a hint, an email address that shows a validation error, a profile address with a fixed prefix, a language select, and the toggles for notifications, billing, and profile visibility. The package styles each control; your HTML provides the labels, the validation, and the error messages, and this page shows how to connect them.

## A labeled field

A field is a label, a control, and an optional hint, stacked:

```html
<div class="field">
  <label class="label" for="display-name">Display name</label>
  <input class="ipt" id="display-name" name="display-name" aria-describedby="display-name-hint" />
  <span class="hint" id="display-name-hint">Shown on invoices and shared projects.</span>
</div>
```

- `.field` stacks its children with a small gap (0.35rem) and takes the full width.
- `.label` sets label text: 1rem, medium weight.
- `.hint` is smaller, secondary-colored helper text. Keep it outside the `<label>` and point `aria-describedby` at it, so a screen reader announces it as a description instead of reading it as part of the field's name.
- `.ipt` styles an `<input>`. Use `.textarea` for a `<textarea>` and `.select` for a `<select>`.

A text control is at least 2.5rem tall (`--control-height`), the same height as a default button, so a field and a button line up in a row. Its default look is no fill and a border. A `.textarea` is at least 7rem tall and can be resized vertically.

## Show a validation error

Mark the control invalid with `aria-invalid="true"` and give the error message `.hint.destructive`:

```html
<div class="field">
  <label class="label" for="email">Email</label>
  <input class="ipt" type="email" id="email" name="email" value="ada@" aria-invalid="true" aria-describedby="email-error" />
  <span class="hint destructive" id="email-error">Enter a full email address, such as ada@example.com.</span>
</div>
```

An invalid control draws its border, focus ring, and typed text in the destructive color, whatever intent class it has. The text uses the readable tone of that color, `--intent-strong`, so it stays legible on the page. The package only paints the state: deciding that the value is invalid, setting and clearing `aria-invalid`, and writing the message are your code. Remove `aria-invalid` once the value is valid again; leaving it set keeps the field red. On a checkbox, radio, or switch, `aria-invalid="true"` draws the toggle exactly as `.destructive` does, checked mark included.

A hint takes any named intent, not only `.destructive`: `.hint.success` confirms a value was accepted, and `.hint.warning` flags one that is allowed but unusual. Each prints in its intent's readable tone, `--intent-strong`, which holds 4.5:1 against the page in both themes. A hint with no intent, or with `.neutral`, stays secondary-colored. Only a class on the hint itself colors it; an intent on the field or a container around it does not.

```html
<input class="ipt success" id="username" value="ada" aria-describedby="username-hint" /> <span class="hint success" id="username-hint">That username is available.</span>
```

## Put the profile form together

```html
<form class="card stack" aria-labelledby="profile-title">
  <h2 class="text-title-sm" id="profile-title">Profile</h2>

  <div class="field">
    <label class="label" for="display-name">Display name</label>
    <input class="ipt" id="display-name" name="display-name" value="Ada Lovelace" aria-describedby="display-name-hint" />
    <span class="hint" id="display-name-hint">Shown on invoices and shared projects.</span>
  </div>

  <div class="field">
    <label class="label" for="email">Email</label>
    <input class="ipt" type="email" id="email" name="email" value="ada@example.com" />
  </div>

  <div class="field">
    <label class="label" for="bio">Bio</label>
    <textarea class="textarea" id="bio" name="bio" rows="3"></textarea>
  </div>

  <div class="field">
    <label class="label" for="language">Language</label>
    <select class="select" id="language" name="language">
      <option>English</option>
      <option>Português</option>
      <option>Español</option>
    </select>
  </div>

  <div class="cluster">
    <button class="btn primary" type="submit">Save changes</button>
    <button class="btn ghost" type="reset">Cancel</button>
  </div>
</form>
```

A `.select` draws its own arrow. With `multiple` or a `size` above 1 it becomes a list box instead: no arrow, as tall as the rows it shows. The open list of options is drawn by the browser and the operating system, so it does not take the package's look.

## Add an icon or a fixed prefix

`.input-group` puts an icon or a piece of text inside a field's border. The group draws the border, background, focus ring, and invalid and disabled states; the control inside it gives up its own, so the border is drawn once. Place the adornment before the control to put it at the start, after it to put it at the end. A group is the height of a lone field, so it lines up with the fields and buttons beside it.

The profile address always starts with the same host, so it is a fixed prefix:

```html
<div class="field">
  <label class="label" for="profile-url">Profile address</label>
  <div class="input-group" style="--input-group-gap: 0">
    <span>app.example.com/u/</span>
    <input class="ipt" id="profile-url" name="profile-url" value="ada" />
  </div>
</div>
```

The gap between the control and its adornment is `--input-group-gap`, 0.5rem by default. That suits an icon, but text meant to read as part of the value looks broken with a space after it, so the example sets it to `0`. Set it on the `.input-group` itself: the group declares its own default, so a value set on a parent element has no effect. It is one of six [public component variables](./customizing.md#component-variables).

A members search, with an icon at the start (the `ic-lucide-*` classes need `@codenhub/icons` loaded; see [Buttons → Loading icons](./buttons.md#loading-icons)):

```html
<div class="field">
  <label class="label" for="member-search">Find a member</label>
  <div class="input-group">
    <i class="ic-lucide-search" aria-hidden="true"></i>
    <input class="ipt" type="search" id="member-search" name="q" />
  </div>
</div>
```

A `.select` works in a group too. The group removes the control's side padding, except at the end of a single-row select, which keeps 1.75rem so the chosen option's text does not run under the arrow.

Any element works as the adornment: an icon class, an inline `<svg>`, an `<img>`, or text. The package ships no icons for fields, because a built-in image could not follow your text color, theme, or aesthetic.

The group reads intent and presentation the way a lone `.ipt` does: `.input-group.primary` colors the border and the typed text, and `.input-group.soft.edgeless` is a field sunk into the page. Put the intent on the group, not on the control inside: the group draws the field, so the control's text takes the group's intent and an intent class on the control has no effect. `aria-invalid="true"` or `disabled` on the control inside applies to the whole group, and so does either on the group itself. The group's focus ring appears when its field has focus, so unlike a lone field it also shows after a mouse click. A button inside the group, such as a clear button, draws its own ring when it has focus, and the group draws none: one ring always marks the one control that has focus.

## Browser decorations

Some input types come with built-in buttons: a date or time field's picker button, a number field's up and down arrows, and a search field's clear button. The package keeps them, because each one also does something: the picker button is the only way to open the picker with a mouse, and the clear button empties the field.

`.unadorned` removes them, for a field where you draw your own. Put it on the control, or on its `.input-group`. Removing a decoration removes what it did, so connect your replacement yourself: `input.showPicker()` opens a picker, `stepUp()` and `stepDown()` replace the arrows, and setting `value` to `""` and dispatching an `input` event replaces a clear button. Typing keeps working either way. Firefox gives no way to remove its date picker button, so it stays there.

```html
<div class="field">
  <label class="label" for="member-filter">Find a member</label>
  <div class="input-group unadorned">
    <i class="ic-lucide-search" aria-hidden="true"></i>
    <input class="ipt" type="search" id="member-filter" name="q" />
    <button class="btn icon ghost p-xs" type="button" aria-label="Clear search">
      <i class="ic-lucide-x" aria-hidden="true"></i>
    </button>
  </div>
</div>
```

The clear button above is a real `<button>` with an accessible name. A button inside a group keeps its own classes: a `.btn.ghost` has no fill and, like every button by default, no border, so it sits inside the field's border without drawing one of its own.

## Toggles

The settings screen has three kinds of toggle: a checkbox to opt into invoice emails, radio buttons to choose a billing period, and a switch to make the profile public. Each class goes on a native `<input>` of the matching type:

```html
<fieldset class="stack tight">
  <legend class="label">Notifications</legend>
  <label class="cluster tight">
    <input class="checkbox" type="checkbox" name="invoice-email" checked />
    Email me when an invoice is ready
  </label>
</fieldset>

<fieldset class="stack tight">
  <legend class="label">Billing period</legend>
  <label class="cluster tight">
    <input class="radio" type="radio" name="period" value="monthly" />
    Monthly
  </label>
  <label class="cluster tight">
    <input class="radio" type="radio" name="period" value="yearly" checked />
    Yearly, two months free
  </label>
</fieldset>

<label class="cluster tight">
  <input class="switch primary" type="checkbox" role="switch" name="public-profile" />
  Public profile
</label>
```

- `.checkbox` goes on `type="checkbox"`, `.radio` on `type="radio"`, and `.switch` on `type="checkbox"`. Give a switch `role="switch"` yourself, so it is announced as on or off rather than checked.
- `.cluster.tight` on the `<label>` lines the control up with its text and leaves a 0.5rem gap.
- A checkbox whose `indeterminate` property is set, for a group where only some items are checked, shows a dash, and keeps the dash while also `checked`, as the browser's own checkbox does. Set it from script (`input.indeterminate = true`); there is no attribute for it.

### Checked and unchecked colors

An intent class sets the checked color. With no intent, a checked toggle is filled with the text color, and the mark is drawn in the page color: a black box with a white check on a light page. Unlike a neutral button, a neutral toggle fills all the way when checked.

Presentation changes only the unchecked look. Every toggle rests at `.soft`; once checked, each has one look whatever its presentation:

| Toggle           | Unchecked fill | Checked                                        |
| ---------------- | -------------- | ---------------------------------------------- |
| `.ghost`         | 0%             | 100% fill, with the mark in the contrast color |
| `.soft`, default | 12%            | 100% fill, with the mark in the contrast color |
| `.solid`         | 40%            | 100% fill, with the mark in the contrast color |

A checked checkbox and a checked switch cut their mark out of the filled plate. A checked radio thickens its ring to twice the resting line width, up to 3px, takes the full intent color on it, and shows a dot. The 3px limit keeps the ring from swallowing the dot under an aesthetic with a thick line.

`.checkbox` and `.radio` always draw their border, even with `.edgeless`, because the border is the only thing that shows an unchecked box. `.switch.ghost` keeps its border too, since with no fill and no border nothing would mark the track. These are listed in [Composing](./composing.md#component-axis-reference).

An aesthetic that draws its border as an inner shadow, such as `.pixel`, cannot make that shadow wider than the toggle's border width. A 16px checkbox or a 20px switch has no room for a thicker inner ring without covering the mark. This only matters if you set `--ui-shadow-spread` yourself; see [Customizing → Material tokens](./customizing.md#material-tokens).

## Fill and border on text controls

Text controls take intent, which colors the border, the focus ring, and the typed text, the text in the intent's readable tone (`--intent-strong`). They also take both presentation axes. Their fill is capped low, so typed text stays readable:

| On a text control                               | Fill |
| ----------------------------------------------- | ---- |
| `.ghost`, default                               | 0%   |
| Any fill from a container (`.soft` or `.solid`) | 6%   |
| `.soft` on the control                          | 12%  |
| `.solid` on the control                         | 20%  |

A container's fill is meant for the surfaces in it, so a field nobody classed takes only a faint 6% of it. Put the class on the field itself for more.

The border works the same way. An `.edgeless` inherited from a container is ignored, so a toolbar cannot leave a field with no visible edge. `.edgeless` written on the control itself is honored: that is how you ask for a borderless field. A borderless field does not meet the WCAG 1.4.11 contrast requirement for a control's boundary, so it is never a default; its focus ring still shows.

```html
<input class="ipt success" placeholder="Matches your current password" />
<input class="ipt soft edged" placeholder="Tinted, with a border" />
<input class="ipt soft edgeless" placeholder="Sunk into the page" />
<div class="soft">
  <input class="ipt" placeholder="A container's .soft gives a 6% tint" />
</div>
```

At rest, a field's border is deliberately lighter than 3:1 against the page, so hover and focus have a visible change to make. [Accessibility → Control boundaries](../accessibility.md#control-boundaries) explains the trade-off and how to get a stronger border.

## Disabled controls

`disabled`, `aria-disabled="true"`, `data-disabled`, or `.disabled` on a control draws it at reduced opacity with a not-allowed cursor. As with buttons, only the `disabled` attribute stops input; the others change the look only.

## Building your own control

For a text-like control the package does not ship, `.text-control` gives an element the same border, placeholder, hover, focus, invalid, and disabled styles as `.ipt`, without its height or padding. [Customizing → Composition helpers](./customizing.md#composition-helpers) explains it with the other building blocks.

## Next

The form can be filled in and submitted. [Feedback](./feedback.md) shows what the screen does next: a Save button that says it is saving, a success message, a plan badge, and a storage usage bar.
