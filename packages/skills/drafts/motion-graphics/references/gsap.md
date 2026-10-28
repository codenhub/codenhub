# GSAP And Browser Rendering

## Contents

- Page Setup
- Building The Timeline
- Text
- Plugins
- Determinism
- Capturing Frames
- Other Browser Animation

## Page Setup

- Make the stage a fixed-size element at the output resolution, such as `width: 1920px; height: 1080px`, positioned at the page's top left with `overflow: hidden`. Set the page's body margin to 0. Do not make the stage responsive; the output has one size.
- Use pixel units for positions and sizes inside the stage.
- Load GSAP and its plugins from a pinned version, from the `gsap` npm package or a CDN URL with an exact version. All of GSAP's plugins ship in the public `gsap` package from version 3.13 onward; pin 3.13 or later when using any plugin.
- Load fonts with `@font-face` from local files, not from a font service that may be slow or unreachable during rendering.

## Building The Timeline

- Build one master timeline, created with `paused: true`, that holds the whole piece. Nothing animates outside it.
- Write each scene as a function that returns its own timeline, and add the scenes to the master with labels: `master.add(intro(), "intro").add(features(), "features-=0.3")`. Negative offsets overlap scenes for transitions.
- Use the position parameter to overlap elements inside a scene: `"<"` starts with the previous tween, `"<0.1"` starts 0.1 seconds after the previous tween's start, and `"-=0.2"` starts 0.2 seconds before the previous tween ends.
- Set the piece's easing family once with `gsap.defaults({ ease: "power3.out", duration: 0.6 })`, and override it per tween only for exits and moves.
- Use `expo.out` or `power4.out` for strong entrances, `power2.in` for exits, and `power2.inOut` for moves. Use `CustomEase` when the brand needs its own curve.
- Give repeating motion a finite `repeat` count that fits the scene. An infinite repeat makes the timeline's duration infinite.
- Build the whole timeline before rendering starts, after fonts have loaded, and expose seeking for the renderer. Put this in a `<script type="module">`, since top-level `await` is a syntax error in a classic script and `window.ready` would never be set:

```js
await document.fonts.ready;
const master = gsap.timeline({ paused: true });
// add scenes here
window.duration = master.duration();
window.seek = (seconds) => {
  master.seek(seconds, false);
};
window.ready = true;
```

- Keep `seek` from returning the timeline. The renderer calls it through `page.evaluate`, which serializes the return value, and serializing a GSAP timeline hangs the call.
- Use timeline callbacks only for changes that are themselves functions of time. A callback that starts a separate tween or timer escapes the timeline and will not render correctly when frames are seeked.

## Text

- Split text with `SplitText` into lines, words, or characters, and split only after `document.fonts.ready` resolves. Splitting before the font loads measures the fallback font and breaks lines in the wrong places.
- Animate reading text by `lines` or `words`, and reserve `chars` for short display words.
- Use `mask: "lines"` (or wrap lines in an element with `overflow: hidden`) for text that slides up into view from behind an edge.

## Plugins

- `SplitText` for animating text by line, word, or character.
- `DrawSVGPlugin` for drawing strokes on, such as for line art and logo reveals.
- `MorphSVGPlugin` for morphing one shape into another.
- `MotionPathPlugin` for moving an element along a path.
- `CustomEase` for brand-specific easing curves.

Register each plugin before use: `gsap.registerPlugin(SplitText, DrawSVGPlugin)`.

## Determinism

- Replace `Math.random()` with a seeded generator, especially in `stagger: { from: "random" }` and `gsap.utils.random()`, when frames may be rendered in more than one page load, such as when rendering in parallel. Otherwise each load produces different values.
- Decode every image before rendering starts, for example with `await Promise.all([...document.images].map((img) => img.decode()))`.
- Avoid CSS transitions and animations on elements inside the stage; they run on the clock. Let the timeline drive every change.
- For embedded video, pause it and set its `currentTime` from the timeline on each seek, then wait for its `seeked` event before capturing the frame.

## Capturing Frames

The following script, using Playwright, seeks the timeline to each frame and saves a PNG sequence that `ffmpeg` can encode. It assumes the page exposes `window.ready`, `window.duration`, and `window.seek` as shown above. Run it with Node after installing `playwright` and a Chromium browser for it.

```js
import { chromium } from "playwright";
import { mkdtemp } from "node:fs/promises";

const [url = "file:///path/to/index.html", fps = "30", width = "1920", height = "1080"] = process.argv.slice(2);
const framesDir = await mkdtemp("frames-");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +width, height: +height }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForFunction(() => window.ready === true);

const total = Math.ceil((await page.evaluate(() => window.duration)) * +fps);
for (let frame = 0; frame < total; frame++) {
  await page.evaluate((t) => window.seek(t), frame / +fps);
  await page.screenshot({ path: `${framesDir}/${String(frame).padStart(5, "0")}.png`, omitBackground: true });
}
await browser.close();
console.log(`${total} frames written to ${framesDir}`);
```

- Each run creates a fresh directory and prints its path and planned frame count. Encode only that directory and compare the encoded frame count with the printed count. Reusing a directory can append obsolete frames when a later render is shorter.
- `omitBackground: true` keeps a transparent page background transparent in the PNGs, for overlays. For an opaque video, give the stage a background color.
- When the page draws on a canvas or uses WebGL, wait for the next animation frame inside `seek` before returning, so the canvas has painted.
- Rendering takes about as long as the screenshots do. For long pieces, split the frame range across several pages or processes, which requires the determinism above.

## Other Browser Animation

When the piece uses CSS animations or the Web Animations API instead of GSAP, seek them in the same way: pause every animation and set its time.

```js
window.seek = (seconds) => {
  for (const animation of document.getAnimations()) {
    animation.pause();
    animation.currentTime = seconds * 1000;
  }
};
```

This sets every animation to the same document time, so give each animation its start offset with `animation-delay` or the `delay` option, not by starting it later from script.
