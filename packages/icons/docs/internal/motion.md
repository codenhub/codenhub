---
status: IMPLEMENTED
last_updated: 2026-11-03
scope: Icon motion in `@codenhub/icons`, covering whole-icon motion utilities, animated-family artwork, triggers, repetition, on-demand playback, and reduced motion.
---

# Icon motion

This document defines how icons move. It starts from the scenarios the API has to serve. Additions are checked against them, so the API grows by covering a new scenario rather than by adding a setting for each example. [Registry architecture](./registry-architecture.md) owns the data model, including `staticBody`, and the animated families' generation.

## Scenarios

| #   | Scenario         | Example                                       | What moves       | When                       | Repeats        |
| --- | ---------------- | --------------------------------------------- | ---------------- | -------------------------- | -------------- |
| 1   | Ambient          | loading spinner, "live" pulse                 | glyph or artwork | always                     | forever        |
| 2   | Ongoing state    | reload spins while a request runs             | glyph            | while the app sets a class | forever        |
| 3   | Hover feedback   | reload turns, bell wiggles, heart draws in    | glyph or artwork | trigger hovered or focused | once per hover |
| 4   | Continuous hover | fan spins while hovered                       | glyph            | trigger hovered or focused | while hovered  |
| 5   | Event feedback   | copy turns to check, like pops, menu to close | glyph or artwork | on demand from code        | once           |
| 6   | Entrance         | Line MD draw-in                               | artwork          | page load                  | once           |
| 7   | Reduced motion   | any of the above                              | nothing          | `prefers-reduced-motion`   | none           |

"Glyph" is the whole icon element, moved by a CSS transform or opacity. "Artwork" is the animation drawn inside an animated family's SVG, which runs as SMIL inside the mask image.

## API

Three independent questions, one control each.

**What moves.** `ic-anim-spin`, `ic-anim-pulse`, `ic-anim-beat`, `ic-anim-bounce`, and `ic-anim-wiggle` move the glyph. An icon from an animated family (`line-md`, `svg-spinners`) moves its artwork without a class.

**When it plays.**

- With no trigger class, it plays always (scenarios 1, 2, and 6). Scenario 2 is the app adding and removing the motion class.
- `ic-on-hover` plays it while the trigger is hovered or has `:focus-visible` (scenarios 3 and 4), for glyph motion and artwork alike. At rest, glyph motion is removed, so the icon sits upright, and artwork shows its static frame (`--ic-static-mask`).
- The trigger is the icon itself, its parent element, or any ancestor carrying `ic-trigger`, at any depth.
- `playIcon(element)` from `@codenhub/icons/play` plays it on demand (scenario 5), restarting glyph motion and artwork alike.

**How often.** `--ic-anim-iterations` sets the repeat count. It defaults to `infinite`, except under `ic-on-hover`, where it defaults to `1`: hover feedback is usually one movement, and a continuous hover (scenario 4) sets `--ic-anim-iterations: infinite`. It inherits, so one declaration on a toolbar sets every icon in it. `--ic-anim-duration` sets the speed. Artwork repeats as authored: Line MD `-loop` icons loop and the others play once, because a mask image's SMIL timing cannot be changed from the page.

**Reduced motion.** Under `prefers-reduced-motion: reduce`, glyph motion is removed and artwork shows its static frame, including while hovered. `playIcon` does nothing. Spinners keep animating: `svg-spinners` has no static artwork, since its motion is what says "loading".

## Mechanisms

- **Restarting on each hover.** At rest, `ic-on-hover` removes glyph motion, so each hover starts a new CSS animation and plays from the start with CSS alone. Artwork cannot be restarted that way. Real-time Chrome measurements on 2026-11-03 showed that SMIL in a mask starts when an exact URL is first displayed, and showing that URL again does not restart it. A fresh media-type nonce (`data:image/svg+xml;n=2,…`) or fragment starts a new timeline. So loops work on hover with CSS alone, and one-shot artwork replays on every hover only through `bindIconPlayback()`, which calls `playIcon` on each trigger. `playIcon` rewrites the data URL head of the element's inline `--ic-mask` with an increasing nonce and removes the override when the trigger ends, so a framework that changes the icon class later is not overridden. For an inline `<svg>` it calls `setCurrentTime(0)`. For glyph motion it rewinds the element's `ic-anim-*` CSS animations.
- **Trigger scope.** The CSS rest selector excludes the icon when it is hovered, when its parent is hovered or has `:focus-visible`, and when an `ic-trigger` ancestor is hovered or has `:focus-visible`. `bindIconPlayback` applies the same rule. Focus counts only for the trigger itself, not for a focused descendant of it, to keep the selector free of `:has()`.
- **Prefix.** Every class, custom property, and keyframe follows the class prefix, as the size axis does.
- **Reserved names.** `anim` is a reserved prefix: no family prefix `anim`, and no icon `anim` or `anim-*`. The exact names `on-hover` and `trigger` are reserved the same way. None collides with a shipped icon; `animation` and other names that only start with `anim` still resolve.
- **Tailwind.** The motion classes and `ic-on-hover` are real utilities, so variants such as `group-hover:ic-anim-spin` stay available for cases outside these scenarios.

## Out of scope

- **Finishing a movement after the trigger ends.** Removing a CSS animation stops it, so a turn cut short snaps back to rest. Finishing it needs script that watches `animationend`, and no scenario has asked for that yet.
- **Scroll-into-view and other triggers.** `playIcon` covers them from code.
- **Per-path motion for static families.** A mask is one image; the page cannot address its paths. That needs inline SVG or new artwork.
- **Changing artwork repetition or speed.** SMIL timing inside a mask image is fixed.

## Rejected alternatives

- **A trigger class per kind of motion** (`ic-anim-hover` for glyphs and `ic-play-hover` for artwork, as first built). Two names for one question, and the user has to know which kind of motion an icon has.
- **`ic-anim-once` and similar count classes.** A class covers one count and cannot be set once for a group; a variable covers any count and inherits.
- **Infinite repetition by default on hover.** Most hover feedback is a single movement; the common case should need no setting.
- **Direct-parent trigger only.** Fails a button whose icon is wrapped in a span, and card-level hover.
- **A per-icon reduced-motion media rule** for artwork. The static artwork is needed at hover rest too, and a custom property serves both without a second copy of the data URI.
- **A runtime controller by default.** The package stays zero-runtime; `@codenhub/icons/play` is opt-in and loads no icon data.

## Browser support

Verified in Chrome 156. Firefox and Safari are untested. The rest selector needs complex `:not()` (Chrome 88, Firefox 84, Safari 9) and `:focus-visible` (Safari 15.4).
