# Effects And Expressive Work

## Contents

- Before Building
- Scale And Composition
- Light, Gradient, And Texture
- Depth And Layers
- Entrance Sequences
- Scroll-Driven Motion
- Pointer Effects
- Canvas, WebGL, And Shaders
- Cost And Fallbacks
- Checking Effects

## Before Building

This applies once a direction has passed its checks. Without one, none of it does.

- Keep the idea's sentence in front of you, and say which part of it each effect carries. Cut an effect that carries none.
- Choose the one or two means the idea needs and push them far. Several mild effects together read as a template.
- Build the plain version first: real content in its final layout, readable, with no effects. Layer the effects on top of it. That version is what people get with a failed script or an unsupported browser, so it must be a finished page. Reduced motion keeps the composition and drops the movement, as Cost And Fallbacks describes.
- Use means you can define exactly: type, CSS, SVG geometry, drawing code, and real images or video. When the idea needs imagery you cannot produce, such as a photograph, an illustration, or a 3D model, ask for the asset, or use an image model when one is available. A crude substitute costs more than the plain version.

## Scale And Composition

Most of the force in expressive work comes from scale, crop, and placement, before anything that would be called an effect.

- **Contrast of scale.** Make the focal element several times larger than everything else. Set display type with `clamp()` so it fills the width at every viewport, and check that the longest word still fits at the narrowest.
- **Crop and bleed.** Let an image or a line of type run off an edge, or across the boundary into the next section, on purpose. A crop that looks accidental is one that cuts a letter or a face in an unreadable place.
- **Break one rule.** Overlap, asymmetry, or an element off the grid stands out only when everything else keeps the grid. Break one alignment rule and hold the rest.
- **Color as a field.** When color is the idea, give it the ground: a full surface in the accent, with type in a color checked against it. A saturated accent on a small button does not carry an idea.

## Light, Gradient, And Texture

- Give light a source. Decide where it comes from, and keep every gradient, glow, highlight, and shadow consistent with that position.
- Interpolate gradients in a perceptual space. `linear-gradient(in oklab, …)` steps evenly in lightness and avoids the dark, muddy middle of an sRGB blend, but it still grays between hues that sit roughly opposite. `in oklch` keeps the chroma through the middle by traveling around the hue wheel, which adds hues between the stops; use it only when those hues are wanted. Otherwise add a middle stop.
- Keep the stops few. Stops close in hue and apart in lightness read as light on a surface. Two saturated, distant hues at the same lightness read as the generated gradient.
- Large smooth gradients show bands. Overlay fine noise at low opacity to break them up.
- For grain, tile a small noise image at a few percent opacity. A turbulence filter over the whole page is recomputed whenever anything under it changes, which stutters once the page moves.
- A glow is light from something that would emit it, such as a screen, a lamp, or a status light. Use one source.
- Use `backdrop-filter` only where content passes under a surface, such as a bar over a scrolling page, and check the text on it against the busiest content that passes beneath.

## Depth And Layers

- Build depth from overlap, size, and sharpness: nearer things are larger, cover farther ones, and are sharper.
- For parallax, move layers by different small amounts, a few percent of the viewport, on scroll or with the pointer. Never move text people are reading.
- For 3D, set `perspective` on the parent and keep rotations small. Text on a rotated or scaled layer can render soft; check it in the render at real size.
- Use one shadow direction for the whole scene. A short, sharp shadow with a longer, softer one under it reads as a real object.

## Entrance Sequences

- Build one sequence for the first view. An entrance repeated on every section is the default this guidance removes.
- Order it by the content's ranking. The headline and the main image are visible at once or arrive first; nothing people came for waits behind decoration.
- Keep the whole sequence under about 1.5 seconds, with the main content readable in the first third. Single elements can take 400–900ms here, longer than interface transitions, with a strong ease-out.
- Never leave content hidden in the stylesheet for a script to reveal. Let the script set the starting state, or use a CSS animation that ends on the visible state. When the script fails, or the page is captured or printed, hidden sections are blank.
- Reveal text by line or by word, behind a mask, and split it only after its font has loaded. Keep the full text available to assistive technology when the visual text is split into pieces.

## Scroll-Driven Motion

- A triggered animation plays once when its element enters the view. A scrubbed animation ties its progress to the scroll position.
- Scrub when scrolling tells the idea: a path that draws, a product that assembles, a move through a sequence. Give a scrubbed animation linear timing, since the person's scrolling sets its pace.
- Never take over scrolling: no changed scroll speed, and no snapping that holds people in place. A pinned section spends scroll distance, so keep it to a few viewport heights.
- CSS scroll timelines (`animation-timeline: view()` and `scroll()`) are not in every browser. Put them behind `@supports (animation-timeline: view())`, and make the final state the default.
- Content must be complete and readable at any scroll position, including after a fast scroll, a jump to an anchor, and paging with the keyboard. Nothing may be left half revealed.

## Pointer Effects

- Effects that follow the pointer, such as a tilt, a spotlight, or a pull toward a button, go behind `@media (hover: hover) and (pointer: fine)`.
- Ease toward the pointer's position on each frame instead of jumping to it.
- Nothing needed to understand or operate the page depends on a pointer effect.
- Keep the system cursor unless the idea needs another, and never hide the cursor over a control.

## Canvas, WebGL, And Shaders

- Use them when the idea cannot be built from the document: many particles that stand for data, a field that flows, a 3D object.
- Build one only when you can run it and look at the result. Shader and 3D code that has never been rendered is unverified, and a small error gives a blank canvas.
- Put a static image or CSS background under the canvas for the time before the canvas starts and for when the graphics context fails or is lost; hide the canvas when that happens, since a canvas that has painted covers what is under it. Under reduced motion, draw one composed frame and stop the loop, or show the static image instead of the canvas.
- Cap the device pixel ratio at 2, size the canvas to its element, handle resizing, and stop the loop when the canvas is off screen or the tab is hidden.
- Drive the animation from elapsed time, never from a frame count, so it runs at the same speed on 60Hz and 120Hz screens.
- Keep text in the document, above the canvas, so it stays sharp, selectable, and readable by assistive technology.
- Use a graphics library the project already has. Adding one for a single background is a dependency to raise before building.

## Cost And Fallbacks

- Under reduced motion, show the composed final state: keep the composition and drop the movement.
- Animating a blur radius, a large `backdrop-filter`, or many layers at once stutters on weaker devices. Fade a layer that is already blurred instead of animating the blur.
- An effect never delays reading or input.
- At phone width, simplify: fewer layers and no pointer effects. A shrunken copy of the desktop composition rarely holds.
- Load video and 3D assets below the first view lazily, and give each a poster image.

## Checking Effects

- Describe what the render shows before comparing it with the idea's sentence. Someone who has not read the sentence should be able to say it from the render.
- Capture the first view at the end of its sequence and in the middle of it, and capture several scroll positions, including one in the middle of a transition. A capture of the full page must show no blank sections.
- Load the page with scripts off, with reduced motion on, and in a browser without the newest feature used. Each must give a finished page, and reduced motion must still show the composition.
- Measure text contrast against the worst part of the background behind it, not the average.
- Run it with the CPU throttled and at phone width.
- When the render still does not read as the idea after revising, return to the plain version and say so.
