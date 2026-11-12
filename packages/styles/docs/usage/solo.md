---
title: Solo classes
description: Painting an aesthetic onto one element from another library, such as a toast or a dialog, and what a solo class reads and ignores.
order: 7
---

# Solo classes

Suppose the settings screen shows "Profile saved" in a toast from a notification library, not in this package's alert. Under `.neobrutalism`, every card and button has the thick outline and the hard shadow, and the toast does not: an aesthetic class only sets values that this package's components read, so it changes nothing on an element the package does not style. A solo class paints the aesthetic directly onto the one element that carries it:

```html
<div class="toast neobrutalism-solo success" role="status">Profile saved.</div>
```

## The six solo classes

Each aesthetic ships its solo class in the same entrypoint, and a solo class needs nothing else loaded:

```css
/* The only stylesheet from this package on the page. */
@import "@codenhub/styles/aesthetics/glass";
```

```html
<div class="toast glass-solo">A pane over whatever is behind it.</div>
```

| Aesthetic       | Solo class           | Paints                                                                                                                                                                                                           |
| --------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.glass`        | `.glass-solo`        | A translucent background, a thin light edge, the blur, a soft two-layer shadow, and the surface corner. With `.glass-liquid`, the liquid pane, drawn on its `::before` and `::after`.                            |
| `.neobrutalism` | `.neobrutalism-solo` | A 2px ink edge, square corners, and the hard offset shadow.                                                                                                                                                      |
| `.pixel`        | `.pixel-solo`        | The stepped outline, the inner ring in place of a border, and the pixel font.                                                                                                                                    |
| `.chunky-tile`  | `.chunky-tile-solo`  | The tile corner, a 2px edge, the bar under it, and the rounded font.                                                                                                                                             |
| `.cyber`        | `.cyber-solo`        | The surface diagonal (the control diagonal on a button or link), a 1px edge, the glow, and the font.                                                                                                             |
| `.sketch`       | `.sketch-solo`       | Uneven elliptical corners (a sharper outline on a pane, a looser one on a button or link, and small rounded ones with `.sketch-rounded`), a 1px solid ink line, the 2px offset shadow, and the handwriting font. |

Do not put a solo class on this package's own components. A `.card` already draws its fill, edge, and intent, and a solo class would paint a second edge and fill over them. Use the aesthetic class there; it also works on a single element: `<button class="btn pixel">`.

## What a solo class reads

A solo element takes the same presentation, intent, and elevation classes a `.card` would:

```html
<div class="toast pixel-solo edgeless">No ring</div>
<div class="toast glass-solo solid success">An opaque green pane</div>
<div class="toast neobrutalism-solo flat">No offset shadow</div>

<section class="soft edged">
  <div class="toast chunky-tile-solo info">Soft and edged from the container, info from itself</div>
</section>
```

| What                                  | Read from                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Fill and edge (`.solid`, `.edged`, …) | The element, or any container: presentation passes down, as it does to components.                  |
| Intent (`.success`, …)                | The element only, as on components. A `.success` container leaves a solo element inside it neutral. |
| Elevation (`.flat`, `.raised`, …)     | The element only, as on components. It scales the offset shadow, the bar, and sketch's shadow.      |
| The aesthetic around it (`.pixel`, …) | Never. See [What a solo class ignores](#what-a-solo-class-ignores).                                 |

With none of those classes, a solo class paints the material alone (edge, corner, depth, outline, blur, font, and press) and leaves the element's own background and text color as they were.

- **Only the six built-in intents.** A solo class takes an intent from `.primary`, `.secondary`, `.success`, `.warning`, `.destructive`, and `.info` only. An intent class you defined yourself, as in [Theming → Your own intent](./theming.md#your-own-intent), is not read, and the element is drawn neutral. To give a solo element a custom color, retheme one of the built-in intents on it or a container, as that section describes.
- **The fill is a layer over the element's own background.** Five of the six paint the fill as an inner shadow and do not set `background`, so a `.soft` solo toast is a tint over whatever the toast already was, and a `.solid` one with a colored intent is opaque. Glass sets its own background, because the translucent background is its material, and mixes the fill over it. A neutral `.solid` is a 20% tint, not the opaque gray a component draws.
- **The text color assumes the theme.** It is set only where a fill or an intent is asked for, and it is the color the theme uses on the page or on the fill. On an element whose own background does not follow the theme, such as a white toast on a dark page, a `.soft` or `.ghost` intent can put light text on a light background; use `.solid`, or leave the intent off.
- **There is no hover tint.** A solo element is not known to be clickable, so it does not get the hover color a `.btn` gets.
- **It reads its aesthetic's knobs and the theme's tokens, with the shipped values as fallbacks.** `--glass-radius-surface`, `--neo-offset`, `--pixel-unit`, `--tile-lift`, `--tile-radius`, `--cyber-cut`, `--cyber-shape`, `--cyber-shape-surface`, `--cyber-glow`, `--cyber-ink`, `--sketch-radius`, `--sketch-radius-surface`, `--sketch-radius-rounded`, `--sketch-radius-surface-rounded`, and the font tokens such as `--font-sketch` all work, set on the element or any ancestor. With the theme loaded, it follows the theme; without it, it renders the shipped look.
- **Dark values need a color scheme.** Light and dark pairs use `light-dark()`, which follows the element's `color-scheme`. The package's theme sets it; a page without the theme gets the light values.
- **The classes it reads come from the theme.** `.solid`, `.edgeless`, `.success`, `.flat`, and the rest ship in the base stylesheet and in `@codenhub/styles/theme`. With an aesthetic entrypoint alone on the page, those classes do nothing, and the solo class paints its unclassed look.

## What a solo class ignores

- **The aesthetic around it.** It reads none of the values an aesthetic class sets, and not `--elevation-color`. A `.glass-solo` inside a `.pixel` region keeps its own corners, and `--ui-radius` or `--ui-border-width` set on it or above it do nothing. Tune it through its knobs.
- **Its own children.** A solo element is not an aesthetic region. A component inside it keeps the look of the page around it, even with `.glass-liquid` or `.sketch-rounded` beside the solo class. It passes down only what any container does: the solo class's font, and the fill or edge of a presentation class on it, so a `.card` inside a `.glass-solo.solid` pane is solid, as inside any `.solid` container.
- **Glass's shadow and `.flat`.** `.flat` does not remove the shadow from `.glass-solo`, as it does not under `.glass`.

## How it wins and when it moves

- **It beats the other library's styles.** The rules are unlayered and one class deep, so they win over a component's layered rules, and over its zero-specificity ones, wherever the two load. An unlayered foreign rule that is more specific, or as specific and later in the page, still wins. The other side of this is that a Tailwind utility on the same element, such as `rounded-none`, loses to the solo class: tune it through its knobs instead.
- **It presses only an action.** Neobrutalism, chunky tile, and cyber press a `button`, `a[href]`, `[role="button"]`, `summary`, or button-type `input` unless it carries the `disabled` attribute, `.disabled`, `aria-disabled="true"`, or `data-disabled`. Only the attribute disables a button; the press ignores the other three too, since a page uses them to mark one it handles as disabled. Anything else stays put, so a toast does not sink when clicked. Chunky tile's heavier label follows the same rule.
- **It leaves a container's motion alone.** Only an action takes the press's `transition`, and the press moves the element through the `translate` and `scale` properties, not `transform`. A toast keeps its own transitions and its own `transform`. On an action, the press's `transition` replaces any the element had.
- **Reduced motion keeps the press and drops its motion.** Under `prefers-reduced-motion: reduce`, neobrutalism, chunky tile, and cyber still press, but at once: the element lands in its shadow or bar, or shrinks, without travelling there.

## Next

The guides end here. [Composing](./composing.md), [Customizing](./customizing.md), and [Content and layout](./content-and-layout.md) are the lookup pages, and [Accessibility](../accessibility.md) lists what the CSS does for your users and what your application still owes them.
