---
title: Composing
description: Combining intent, presentation, and aesthetic on a component, and the axis-support matrix.
---

# Composing the three axes

See [Concepts](../concepts.md#the-three-axes) for what each axis means. This
page covers how they combine in markup, what the presentation classes mean in
depth, which components support which axis, and elevation.

## Combining axes

```html
<div class="soft">
  <button class="btn primary">Soft primary button</button>
  <span class="badge success">Soft success badge</span>
  <button class="btn primary ghost edged">Outlined; the element wins</button>
</div>
```

A declaration on the element always beats one inherited from a container, so
a container sets the default look for its subtree and any element opts out.

Intent classes do not cascade. `.primary` and its siblings stay on the
element that shows the intent, because a container silently recoloring every
descendant is a trap rather than a feature — see
[Theming → Intent tokens](./theming.md#intent-tokens). Use `.neutral` to opt
an element back out of an inherited intent context. Presentation and
[material tokens](./customizing.md#material-tokens) do cascade, so a
container can set the look of its whole subtree while any element overrides
it.

## Presentation

Presentation has two independent axes. `.solid`, `.soft`, and `.ghost`
decide how much intent fills a component; `.edged` and `.edgeless` decide
whether it draws a boundary. They set
[presentation tokens](./customizing.md#presentation-tokens) and nothing
else, so they work on the component itself or on any ancestor.

| Class       | Look                                                       |
| ----------- | ---------------------------------------------------------- |
| `.solid`    | Intent-colored fill with contrast text.                    |
| `.soft`     | Lightly tinted fill with intent-colored text.              |
| `.ghost`    | No fill at rest, with intent-colored text.                 |
| `.edged`    | Intent-colored boundary at the aesthetic's material width. |
| `.edgeless` | No boundary.                                               |

Values each class ships:

| Class       | `--ui-fill` | `--ui-fg-on-fill` | `--ui-border` |
| ----------- | ----------- | ----------------- | ------------- |
| `.solid`    | `100%`      | `100%`            |               |
| `.soft`     | `12%`       | `0%`              |               |
| `.ghost`    | `0%`        | `0%`              |               |
| `.edged`    |             |                   | `100%`        |
| `.edgeless` |             |                   | `0%`          |

The combinations mean exactly what they spell:

```html
<button class="btn primary">Solid, the button default</button>
<button class="btn soft edged">Tinted with a border</button>
<button class="btn primary ghost edged">Outline</button>
<button class="btn ghost">Ghost; picks up a tint on hover</button>
<input class="ipt soft edgeless" />
<!-- A field sunk into the page -->
```

A fill class never decides an edge and an edge class never decides a fill.
Use `.solid.edgeless` for a filled box with no line — and prefer it on a
neutral one, because a capped fill leaves the box translucent and the edge
blend then paints a second coat of the same tint rather than disappearing
into it (measured 1.53:1 against its own plate in light, 1.82:1 in dark).

The edge is the silhouette and nothing else. Rules _inside_ a component that
has an inside are a separate switch — see
[Content and layout → Table rules](./content-and-layout.md#table-rules) —
because tying them to this axis made them arrive by implication rather than
by request.

With no presentation class in scope, each component keeps its own default:
buttons are filled, alerts and badges are tinted, surfaces and controls are
neutral and bordered.

| Component                                       | Reads                                       |
| ----------------------------------------------- | ------------------------------------------- |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`   | Fill, text, border, and border width.       |
| `.kbd`                                          | Fill, text, border, and border width.       |
| `.data-table`                                   | Header fill and text, border, border width. |
| `.ipt`, `.textarea`, `.select`, `.text-control` | Border, border width, and a capped fill.    |
| `.checkbox`, `.radio`                           | A capped fill, checked and unchecked.       |
| `.switch`                                       | Border, border width, and a capped fill.    |
| `.quote`                                        | Fill, text, border, and width.              |
| `.code`, `.pre`, `.tooltip`                     | Fill, text, border, and material.           |
| `.loader`, `.skeleton`, `.progress`, `.divider` | Intent only, not presentation.              |

Text controls and toggles cap a **cascaded** fill at `6%`, keeping typed
text legible when a `.solid` container reaches a field nobody classed. A
fill class written on the control itself names its own cap instead, because
that is a consumer describing what they want: `.soft` takes `12%` and
`.solid` takes `20%`. A switch caps at `40%`, where its three fills separate
far enough to read on a track.

| On a text control | fill |
| ----------------- | ---- |
| `.ghost`          | 0%   |
| cascaded `.solid` | 6%   |
| `.soft`           | 12%  |
| `.solid`          | 20%  |

The same split governs the edge: a cascaded `.edgeless` is floored and the
element's own is honoured — except on `.checkbox` and `.radio`, which never
drop their line at all. See [Forms](./forms.md) for the full toggle and text
control reference.

A tooltip bubble is filled, over a tinted ground. An intent fills it with
that intent's own color: `.tooltip.primary` is the primary color, black on a
light page and white on a dark one, and `.tooltip.destructive` is a red
bubble.

With no intent the bubble is `--color-tooltip`, the one plate in the package
chosen per theme rather than derived from an intent. Composed like
everything else it was `20%` of the page's ink over the surface tone, which
steps _lighter_ than the surface on a dark page and _darker_ on a light
one — so the dark bubble read as lifted and the light one as a mid-grey
slab two steps darker than every card on the screen. The token states each
direction instead: near-white over a light page, a mid grey over a dark
one. `--color-tooltip-contrast` is its ink.

Near-white is only 1.04:1 against a light page, so the bubble draws a
hairline as well, and floors it: a container's `.solid` or `.edgeless`
cannot take the boundary away from a bubble nobody classed, while
`.tooltip.edgeless` still can. The ground keeps the bubble opaque at every
fill, so a cascaded presentation leaves it readable over whatever it floats
above. It reads the material tokens too, so an [aesthetic](./aesthetics.md)
in scope shapes the bubble like any other component. See
[Tooltips](./tooltips.md) for the full tooltip reference.

## Component axis reference

This table is the authoritative axis map for demonstrated components. "Shape"
means the component reads applicable radius, border-width, shadow, hover, or
clip/edge material tokens; an aesthetic may intentionally affect only the
materials that component draws.

Presentation is two independent axes, so they get a column each. A `Yes` means
the class changes what the component computes, which
`tests/browser/axes.spec.ts` asserts against `registry.json` in both
directions: an axis marked `Yes` must move, and an axis marked `No` must not.

| Components                                                | Intent | Fill | Edge | Aesthetic material |
| --------------------------------------------------------- | ------ | ---- | ---- | ------------------ |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`             | Yes    | Yes  | Yes  | Shape              |
| `.loader`                                                 | Yes    | No   | No   | No                 |
| `.kbd`, `.data-table`                                     | Yes    | Yes  | Yes  | Radius and edge    |
| `.quote`                                                  | Yes    | Yes  | Yes  | Edge width         |
| `.divider`, `.skeleton`                                   | Yes    | No   | No   | No                 |
| `.ipt`, `.textarea`, `.select`, `.text-control`           | Yes    | Yes  | Yes  | Shape              |
| `.surface`                                                | Yes    | Yes  | Yes  | Shape              |
| `.checkbox`, `.radio`                                     | Yes    | Yes  | No   | Radius and edge    |
| `.switch`                                                 | Yes    | Yes  | Yes  | Radius and edge    |
| `.progress`                                               | Yes    | No   | No   | No                 |
| `.code`, `.pre`                                           | Yes    | Yes  | Yes  | Radius and clip    |
| `.tooltip`                                                | Yes    | Yes  | Yes  | Shape and overlay  |
| `.table-wrap`, `.quote-inline`, layout and text utilities | No     | No   | No   | No                 |

`.checkbox` and `.radio` are the only components that read one axis and not
the other. Their line is the only thing marking an unchecked box, so it is
drawn whatever the edge class says, from a container or from the element
itself. `.edgeless` on either is unsupported rather than merely discouraged.

Every other text control floors a _cascaded_ `.edgeless` and honours its own:
a `.edgeless` toolbar will not erase the line of a field nobody classed, while
`.ipt.edgeless` is a consumer describing what they want and gets it.

Intent aliases such as `.danger` and `.error` occupy the same intent axis as
`.destructive`; they do not add component behavior. State and modifier
classes such as `.interactive`, `.loading`, `.invalid`, `.compact`, and
`.vertical` sit above this map and are documented with their component.

## Elevation

Depth is a modifier, not an axis. Nothing is raised until an
[aesthetic](./aesthetics.md) draws depth or one of these classes asks for it.

| Class       | Depth                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| `.flat`     | Removes part-based elevation; glass surfaces keep their complete shadow. |
| `.raised`   | One unit of the depth in scope. Cards, tiles, popovers that sit close.   |
| `.floating` | Twice it, for menus and popovers.                                        |

Each is one unitless multiplier over whatever shadow geometry is in scope, so
the same class reads as a soft blur on a plain page and as a hard offset slab
under `.neobrutalism` — the aesthetic decides what depth looks like, the
class decides how much of it this element takes.

```html
<article class="card raised">Lifted</article>
<div class="floating panel">A menu surface</div>
<article class="card flat">Flat, whatever the page or container says</article>
```

The multiplier is a plain number, so it inherits: a container lifts or
flattens a whole region and any element inside it still opts out on itself.
Spread is deliberately left out of the multiplication, because an aesthetic
that draws its edge as an inset ring spends spread on it and scaling that
would erase the edge.
