# Interface Motion

## Contents

- When To Animate
- Duration
- Easing
- Distance And Origin
- Choreography
- Reduced Motion
- Implementation
- Checking Motion

## When To Animate

Interface motion explains a change the person would otherwise have to work out. Animate when it answers one of these:

- **Where did this come from, and where did it go?** A menu grows from its trigger, a panel slides from the edge it lives on, a deleted row collapses so the list closes the gap.
- **Did my action register?** A pressed state, a toggle that slides, a checkmark that draws in.
- **What changed?** A value that counts to its new number, a row that briefly highlights after an update.
- **Is something still happening?** Progress and loading indicators.

Do not animate content on scroll or page load just because it entered the viewport, and do not add hover motion to elements that do nothing. Motion that answers no question delays content and teaches people to wait.

## Duration

Interface motion is short. People use these elements repeatedly, and every animation is a delay they pay each time.

| Change                                                | Duration  |
| ----------------------------------------------------- | --------- |
| Press, hover, focus, toggle, color change             | 100–150ms |
| Small element appearing: tooltip, menu, popover       | 150–200ms |
| Medium element: dialog, side panel, expanding section | 200–300ms |
| Large or full-screen change: page or view transition  | 250–400ms |

- Exits run faster than entrances, about two thirds of the entrance duration. Once the person dismisses something, they are done with it.
- Scale duration with distance and size: an element crossing the screen needs more time than one moving 8px.
- Keep any animation that sits between an action and its result under 400ms, and never block input while it runs.

## Easing

- Elements entering use ease-out: fast start, gentle stop, so they feel responsive and settle into place.
- Elements leaving use ease-in: they accelerate away.
- Elements moving or resizing on screen use ease-in-out.
- Use linear only for continuous, mechanical motion, such as a spinner's rotation or a progress bar's fill.
- The browser's default `ease` and `ease-out` keywords are weak. Use a stronger curve, such as `cubic-bezier(0.2, 0, 0, 1)` for entrances and `cubic-bezier(0.3, 0, 1, 1)` for exits, and define each once as a token.
- Bounce, elastic, and overshoot are a personality decision. Reserve them for a playful product, and even there keep them off frequent actions.

## Distance And Origin

- Move a short distance. Entrances travel 4–24px; a dialog that slides in from far away looks slow at any duration.
- Scale from about 0.95, not from 0. Scaling from nothing looks like a pop-up ad.
- Grow from the origin: set `transform-origin` to the trigger, so a menu opens from its button and a dropdown from its edge.
- Keep spatial logic consistent. If a panel enters from the right, it leaves to the right, and the next view in a sequence comes from the same side.

## Choreography

- Move one thing at a time, or a few things as one group. Several unrelated elements moving at once compete for attention.
- Stagger list items by 20–40ms each, and cap the total so the last item starts within about 200ms. A long list that cascades in item by item makes the person wait for the bottom.
- Lead with what matters: in a dialog, the container arrives first and its content follows, not the reverse.

## Reduced Motion

When the person has asked for reduced motion, replace movement with an instant change or a short opacity fade. Keep feedback and progress, since those carry information; remove parallax, large movement, zooms, and decorative loops. Never use reduced motion as a reason to remove the state change itself.

## Implementation

- Animate `transform` and `opacity`. Animating `width`, `height`, `top`, `left`, or `margin` makes the browser recalculate layout every frame and stutters on weaker devices.
- Use CSS transitions for state changes, such as open and closed or hover. They retarget smoothly when interrupted halfway; keyframe animations restart instead. Use keyframe animations for loops and multi-step sequences.
- Use the Web Animations API when script must start, reverse, or sequence motion. Use the View Transitions API for transitions between views where the browser supports it, and leave the change instant elsewhere.
- To animate to and from an automatic height, animate `grid-template-rows` from `0fr` to `1fr` on a grid wrapper, or animate `height` to a measured value on an `overflow: hidden` wrapper and clear it when the animation ends. A transform alone leaves the surrounding content in place, so it overlaps or leaves a gap.
- Interface motion rarely needs an animation library. Use one when the product already has one, or for physics-based gestures such as drag with momentum.
- Gate hover effects behind `@media (hover: hover)` so touch devices do not get stuck in the hover state after a tap.
- Never let an animation shift the layout around it unexpectedly. Reserve the element's space before it appears, or animate it out of the document flow. When content is intentionally expanded, collapsed, inserted, or removed, let the surrounding content reflow smoothly with it instead of jumping.

## Checking Motion

- Slow every animation to ten times its duration, with browser developer tools or a temporary multiplier, and watch each one: the origin, direction, easing, and order must look intended.
- Interrupt each one: click twice fast, hover in and out quickly, close a dialog while it opens. Nothing should jump, restart, or end in the wrong state.
- Turn on reduced motion and confirm every state change still happens and is still visible.
- Run the interface with the CPU throttled and confirm the motion stays smooth.
