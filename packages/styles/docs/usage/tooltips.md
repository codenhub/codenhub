---
title: Tooltips
description: Field help that opens on hover and focus, how to connect it for screen readers and Escape, and where a tooltip gets cut off.
order: 4
---

# Tooltips

The "Public profile" switch on the settings screen deserves a short explanation: what becomes visible when it is on. This page adds a help button beside it that shows a tooltip on hover and on keyboard focus. The CSS shows and hides the message and draws it; you connect it to its trigger for screen readers, add the Escape key, and check that nothing around it cuts it off.

## A help tooltip

```html
<div class="cluster tight">
  <label class="choice">
    <input class="switch primary" type="checkbox" role="switch" name="public-profile" />
    Public profile
  </label>
  <span class="tooltip">
    <button class="tooltip-icon" type="button" aria-label="About public profiles" aria-describedby="public-profile-help">?</button>
    <span class="tooltip-bubble" role="tooltip" id="public-profile-help">Anyone with the link can see your name, photo, and public projects.</span>
  </span>
</div>
```

The three parts:

- `.tooltip` wraps the trigger and the message. It positions the message and paints nothing itself. It takes its trigger's size in any layout, so a `.stack`, a `.field`, or a grid does not stretch it and move the message off the trigger. A trigger sized by a percentage, such as a full-width `.ipt`, takes its own size inside it instead; give the `.tooltip` the width you want the trigger to have.
- `.tooltip-bubble` is the message. It is a real element, so it can have an `id` that the trigger points to.
- `.tooltip-icon` is a small round trigger, for a message with nothing else to attach to. Any focusable element can be the trigger instead: wrap an existing `.btn` in `.tooltip` and it keeps its own look.

Connect them yourself: an `id` on the bubble, `aria-describedby` on the trigger pointing to that `id`, and `role="tooltip"` on the bubble. A screen reader then reads the message as the trigger's description. The CSS cannot make this connection, and without it the message is visual only.

The trigger must be focusable, such as a `<button>`, so keyboard users can reach the message. The bubble opens when anything inside `.tooltip` has focus, so it also opens after a mouse click on the trigger.

## Placement

The bubble opens above its trigger, horizontally centered, with a 0.5rem gap. Set `data-tooltip-position` on `.tooltip` to choose another side:

```html
<span class="tooltip" data-tooltip-position="bottom">
  <button class="btn ghost sm" type="button" aria-describedby="renewal-help">Renews 12 March 2027</button>
  <span class="tooltip-bubble" role="tooltip" id="renewal-help">Your card is charged on this date.</span>
</span>
```

| `data-tooltip-position` | Bubble                                            |
| ----------------------- | ------------------------------------------------- |
| _none_ or `"top"`       | Above the trigger, centered.                      |
| `"bottom"`              | Below the trigger, centered.                      |
| `"left"`                | To the left of the trigger, centered vertically.  |
| `"right"`               | To the right of the trigger, centered vertically. |

A bubble is as wide as its text, up to 18rem, and then wraps.

### Where a tooltip gets cut off

The bubble is positioned with CSS only, on the side you chose. Nothing measures the page: it does not move to stay inside the window, flip to the other side when there is no room, or move to the top layer of the page. That has four consequences:

- **A scrolling or clipping container cuts it off.** An ancestor with `overflow: hidden`, `auto`, or `scroll` clips the bubble at its edge. The API keys table on the settings screen sits in a `.table-wrap`, which scrolls, so a top tooltip on the first row is cut off at the top of the wrapper. Raising `z-index` does not help: it changes what the bubble is painted above, not whether the container clips it.
- **The window edge cuts it off.** A top tooltip on the first line of a page, or a right tooltip near the right edge, extends off screen.
- **Left and right are physical sides.** In a right-to-left page, `"left"` still means the left side of the screen.
- **The next card can cover it, briefly.** Under `.glass`, every card, panel, alert, and table is its own layer, so a bubble is painted above the surfaces after its own only while its surface is lifted. Under glass those surfaces are `position: relative` at rest, except a `<dialog>` or `[popover]`, which keeps the placement the browser gives it, so an absolutely positioned child is placed against its surface. The package lifts a `.card`, `.panel`, `.alert`, `.surface`, or `.data-table` by one step, `z-index: 1`, while it holds a tooltip pinned open, or an open popover or `[open]` element, or holds focus, or while it is hovered with a tooltip inside. One step clears the surfaces beside it and stays under your own layers, such as a sticky header or an open menu. Outside glass a surface is not its own layer, and nothing is lifted. A surface you positioned yourself, or gave its own `z-index`, keeps it, with one exception under glass: a position set in your own `@layer components` on an element that also carries a package surface class, as in `class="panel my-header"`, loses to the package's `relative`. Set that position with a utility such as `sticky`, or in a rule outside any layer. The blur also makes each glass surface the containing block for a `position: fixed` child, so a fixed bubble inside a card is placed against the card; a bubble opened as a `popover` is placed by the browser's top layer instead. Once the pointer leaves the surface, the lift ends at once, so a bubble that overhangs the next card fades out beneath it during `--tooltip-linger`.

What to do:

- Choose a side with room: on a table's first row, use `data-tooltip-position="bottom"`.
- Move the tooltip's trigger out of the clipping container, or remove the `overflow` from a container that does not need it.
- If the trigger's position cannot be known in advance, such as in a scrolling list or a resizable panel, use a positioning library or your framework's popover component, which can measure and flip. You can still give its message element the `.tooltip-bubble` classes for the look. Outside `.tooltip`, the class is the look alone: no hidden resting state, position, or scaling, so a popover the library opens, such as `<div popover class="tooltip-bubble primary">`, shows as soon as it opens. The showing, hiding, and positioning described on this page then come from that library.

## Hover, linger, and Escape

WCAG 1.4.13 asks three things of content that appears on hover or focus. The package handles two:

- **Hoverable.** When the pointer leaves the trigger, the bubble stays for `--tooltip-linger` (300ms) and then fades, so the pointer can cross the gap onto it. It stays open while the pointer is over it. A closed bubble is `visibility: hidden`, so it never catches the pointer.
- **Persistent.** It stays open until the pointer and focus leave.
- **Dismissible.** The user must be able to close it without moving the pointer or focus, usually with Escape. CSS cannot listen for a key, so this part is yours.

To change the linger time, set `--tooltip-linger` on the `.tooltip` element or on any element around it, for example `style="--tooltip-linger: 500ms"`. Keep it long enough for the pointer to reach the bubble. `--tooltip-gap` sets the space between the trigger and the bubble the same way. Both are [public component variables](./customizing.md#component-variables).

For Escape, write `data-state="closed"` on `.tooltip`: it hides the bubble even while it is hovered or focused. Remove the attribute only when both the pointer and focus have left the tooltip, so the next hover or focus opens it again. Removing it earlier, while the trigger still has focus, makes the message reappear without the user doing anything.

```js
for (const tooltip of document.querySelectorAll(".tooltip")) {
  let pointerInside = tooltip.matches(":hover");

  tooltip.addEventListener("pointerenter", () => {
    pointerInside = true;
  });

  tooltip.addEventListener("pointerleave", () => {
    pointerInside = false;
    if (!tooltip.contains(document.activeElement)) tooltip.removeAttribute("data-state");
  });

  tooltip.addEventListener("focusout", (event) => {
    const focusStaysInside = tooltip.contains(event.relatedTarget);
    if (!focusStaysInside && !pointerInside) tooltip.removeAttribute("data-state");
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const tooltip of document.querySelectorAll(".tooltip:hover, .tooltip:focus-within")) {
    tooltip.dataset.state = "closed";
  }
});
```

`data-state="open"` does the opposite: it shows the bubble with no hover or focus, for a message that should stay visible, or for a test or a screenshot.

## How the bubble looks

With no intent class, the bubble uses `--color-tooltip`, a background chosen per theme: near-white on a light page, mid gray on a dark one, with `--color-tooltip-contrast` as its text color. Near-white measures only 1.04:1 against a light page, so the bubble also draws a thin border, and a container's `.edgeless` cannot remove it. `.edgeless` on the bubble itself still can. The background stays opaque under any presentation, so the bubble stays readable over whatever it covers.

An intent class fills the bubble with that intent's color and switches the text to the matching contrast color:

- `.tooltip-bubble.primary` has a near-black background with near-white text on a light page, and a near-white background with near-black text on a dark one.
- `.tooltip-bubble.destructive` has a red background with light text in both themes.

Put intent, presentation, aesthetic, and elevation classes on `.tooltip-bubble`, the element that is painted, not on `.tooltip`. The bubble is flat by default, even under an aesthetic that draws depth; add `.raised` or `.floating` to the bubble to lift it. `.glass` is the exception: its shadow is one complete value that elevation cannot scale, so a glass bubble keeps that shadow, and `.flat` does not remove it either. An aesthetic in scope shapes the bubble like any other component; under `.glass` it is frosted like a card. `.tooltip-icon` takes the aesthetic's corner: square under `.neobrutalism` and `.pixel`, a diamond under `.cyber`.

The bubble appears without scaling up when the user asks for reduced motion, either through the system setting or with `data-motion="reduce"` on `<html>`. With `data-motion="none"` its fade ends at once too, after the linger, and `data-motion="full"` keeps the scaling even when the system asks for less motion. [App settings](../accessibility.md#app-settings) describes the attribute.

## Next

The settings screen is complete in its default look. [Theming](./theming.md) gives it a dark mode and your brand colors.
