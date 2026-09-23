---
status: DRAFT
last_updated: 2026-09-23
scope: Decision to ship a self-contained `-solo` utility beside every aesthetic, for elements this package does not style.
---

# Solo utilities: an aesthetic on one element, without the package

This is a proposal awaiting approval. Nothing here is agreed direction until the status reads `APPROVED`.

Like [`.progress` gains presentation](./progress-presentation-axes.md), it states the decision and the reasoning, not drop-in code: the values below are the ones the implementation must reproduce, and the source is where they are written.

## The problem

An aesthetic class only declares material tokens ([Model](./model.md#aesthetic)). Nothing paints until a component resolves them, so `.glass` on an element this package does not style -- a `@codenhub/toaster` toast, a third-party dialog, a plain `<div>` in an app that never imported the base stylesheet -- changes nothing. [Roadmap](./roadmap.md#later--possible) recorded the ask from toaster: one class a consumer can hand to a foreign component's `className` that applies the whole look, whether or not that component reads a single `--ui-*` token.

`.glass` cannot take on that job itself. It is a cascading scope: `<section class="glass">` means "everything in here is glass", not "this section is a glass pane". Making the class also paint the element carrying it would turn every themed region into a panel.

## Decision

Every aesthetic ships a second class, `.<aesthetic>-solo`, that paints the aesthetic's material directly onto the element carrying it and onto nothing else.

| Aesthetic       | Solo class           |
| --------------- | -------------------- |
| `.glass`        | `.glass-solo`        |
| `.neobrutalism` | `.neobrutalism-solo` |
| `.pixel`        | `.pixel-solo`        |
| `.chunky-tile`  | `.chunky-tile-solo`  |
| `.cyber`        | `.cyber-solo`        |

`.cyber` is the aesthetic proposed in [Cyber](./cyber-aesthetic.md); it ships with its solo class from the start.

### S1. Material only, never colour the axes own

A solo class reproduces what its aesthetic contributes: edge width and ink, corner, depth, silhouette, backdrop, font, and press. It does not reproduce what presentation and intent contribute -- fill amount, intent hue, hover tint -- because an element outside the package has no presentation or intent to compose. The one fill a solo class paints is glass's translucent ground, which is glass's material rather than a presentation ([Model](./model.md#material-tokens): `--ui-surface-ground`).

### S2. Colour comes from the aesthetic's own tokens, with literal fallbacks

Each colour is the one the token class uses, read through the same foundation token and falling back to that token's shipped literal value. Neobrutalism's ink is `light-dark(var(--color-neutral-950, <literal>), var(--color-neutral-50, <literal>))`, glass's ground mixes `var(--color-background, <literal>)`, and so on. With the package's theme loaded, a solo element follows it; without it, the element still renders the shipped look.

It does not read `--intent-*` or `--ui-*`. `--ui-*` belongs to whichever aesthetic is in scope, so reading it would let an ancestor `.pixel` region zero a `.glass-solo`'s corners. `currentColor` was considered for the ink and rejected: the aesthetics define their ink as a theme-following neutral, and tying it to text colour would make the solo look diverge from the token-class look it is named after.

### S3. Knobs are the only tuning surface

A solo class reads the same public knobs as its token class -- `--glass-radius-surface`, `--neo-offset`, `--pixel-unit`, `--tile-lift`, `--tile-radius`, `--font-pixel`, `--font-rounded`, and cyber's own -- with the same defaults, resolved on the solo element, so a knob set on the element or on any ancestor reaches it ([R8](./model.md#rules-for-aesthetics)). Glass's solo takes the surface corner, since the element it exists for is a pane.

The elevation modifiers (`.flat`, `.raised`, `.floating`) do not reach a solo element. They multiply `box`'s shadow parts, and a solo element has no `box`.

### S4. Unlayered, one class of specificity

Each solo rule is unlayered, at `(0,1,0)`. Measured before this proposal: a rule in `@layer components` loses to toaster's own unlayered `:where(...)` rules on every property it shares with them, because an unlayered declaration beats a layered one at any specificity. An unlayered single class beats `:where()`'s zero specificity regardless of source order. The foreign component this exists for is exactly the one it has to win against.

The trade: a consumer's Tailwind utility on the same element (`rounded-none`) loses to the solo class, as it does to any unlayered rule. The knobs in S3 are the intended way to tune it.

A solo class is not for this package's own components. On a `.card` it would overwrite the composed fill, edge, and intent with material alone. The token class is the tool there, and the documentation says so.

### S5. Press only where something is pressed

The aesthetics that move on press (neobrutalism's travel into its slab, chunky tile's drop onto its bar, and cyber's) apply that press on a solo element only when the element is an action: `button`, `a[href]`, `[role="button"]`, `summary`, and `input` of type `button`, `submit`, or `reset`. Disabled actions (`:disabled`, `[aria-disabled="true"]`) do not press. This mirrors the token classes, where only `.btn` and an opted-in `.card` press and a container stays put -- a solo toast should not sink when it is clicked to dismiss. Under `prefers-reduced-motion: reduce` the transform is dropped and the shadow change stays.

Chunky tile's heavier, tracked label follows the same selector, for the same reason its token class limits it to actions.

### S6. Per-aesthetic notes

- **Glass.** Ground, hairline edge, blur and saturation, and the two-layer tucked shadow. Under `prefers-reduced-transparency: reduce` it becomes opaque and drops the blur, as the token class does.
- **Neobrutalism.** 2px ink edge, square corners, hard offset slab in the ink.
- **Pixel.** The one-unit polygon silhouette and the one-unit inset ring in place of a border, and the pixel font. Clipping removes the focus outline, so a focused solo element draws the focus ring as a second inset layer, as `box` does under the token class; it reads `--focus-ring` and `--focus-ring-width` with their shipped fallbacks.
- **Chunky tile.** Corner, 2px edge in the tile grey, and the bar: straight down, unblurred, a 72% shade of the edge ink toward black. With no fill to shade, the bar shades the ink -- the same colour an unfilled tile's bar already is under the token class.
- **Cyber.** As specified in [Cyber](./cyber-aesthetic.md), without the elevation gate: a solo element is by definition something the consumer chose to light up, so it always glows.

### S7. Themes

Every light/dark pair is written with `light-dark()`, which follows the element's computed `color-scheme`. The package theme sets `color-scheme` on `:root`; a page without it defaults to `normal`, which resolves the light value. The public documentation states this, since it is the one thing a solo class needs from its surroundings.

## Public surface

- No new export. Each solo class ships in its aesthetic's existing entrypoint (`./aesthetics/<name>`, `./tw/aesthetics/<name>`) and in both aggregates. An aesthetic entrypoint still carries no Tailwind directive ([Tier 1](./model.md#tier-1----material-tokens)).
- `registry.json` gains a `solo` field on each aesthetic entry, naming the class, so the duplicate-class and Tailwind-collision checks cover it.
- `docs/usage/aesthetics.md` gains a section on solo classes; the README and LLM files follow through `pnpm generate`.
- Additive, so a minor: `0.4.0`, together with `.cyber`.

## Tests

- A fixture that loads only an aesthetic entrypoint and no base stylesheet, asserting each solo class's computed properties on a bare `<div>` and a bare `<button>` -- the case the feature exists for.
- The same with the theme loaded, asserting the colours follow its tokens.
- Each knob reaching a solo element from an ancestor.
- A solo class winning against a zero-specificity foreign rule loaded after it.
- Press on an action, no press on a container or a disabled action, no transform under reduced motion.
- Pixel's focus ring on a focused solo element; glass's opaque fallback under reduced transparency.

## Not in scope

- Moving the aesthetics or the solo classes into a cascade layer. Measured and deferred as its own decision: it needs the whole package's layering redesigned, not one file wrapped. See [Roadmap](./roadmap.md#later--possible).
- Updating `@codenhub/toaster`'s styling guide to recommend `.glass-solo` over `.glass`. It belongs to that package, after this one releases.

## References

- [Model](./model.md)
- [Cyber](./cyber-aesthetic.md)
- [Roadmap](./roadmap.md)
