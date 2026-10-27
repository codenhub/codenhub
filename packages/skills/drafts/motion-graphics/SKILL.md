---
name: motion-graphics
description: Creates motion graphics and animated videos built with web technology, such as explainers, product promos, animated social posts, kinetic typography, title cards, lower thirds, logo animations, and animated charts, rendered to MP4, WebM, GIF, or image sequences. Use when asked to make, storyboard, animate, time, or render a video or animation meant to be watched as video. Not for transitions or micro-interactions inside an app or website.
---

# Motion Graphics

Motion graphics is design over time. Each frame must work as a composition, and the sequence must direct attention: one thing moves, the eye follows it, the message lands, and it holds long enough to be read.

Generated motion fails in predictable ways: a sequence of headline cards that is a slide deck with entrance animations, content huddled in one corner of an empty dark frame, interface invented from rounded rectangles, everything entering at once with the same fade-up or slide-up, text leaves before anyone can read it, movement is linear or uses one default ease throughout, scenes cut with generic crossfades, the animation runs on the computer's clock so the render drops or doubles frames, and the output is never inspected frame by frame. Plan the piece in time before building it, and render it in a way that makes every frame exact.

## Procedure

1. **Brief.** Establish the purpose, the platform, the aspect ratio and resolution, the duration, the frame rate, whether it plays with sound, and the brand assets. When the request leaves these open, infer them from the platform and state the assumptions. See Formats.
2. **Script.** Write the message as beats: one idea per beat, in the order the viewer needs them.
3. **Concept.** Choose the visual idea that carries the beats, as described in Concept.
4. **Storyboard.** Write a timing table and render a still of each beat's key frame, as described in Storyboard. Fix composition and text on stills before animating; stills are far cheaper to change than animation.
5. **Setup.** Use the project's existing animation and render setup when it meets the requirements in Render Setup. Otherwise use the default setup.
6. **Animate.** Build beat by beat, applying Timing And Easing and Composition.
7. **Render.** Render every frame from the timeline, then encode.
8. **Check.** Follow Verification below, and fix every failure before presenting.

## Formats

| Platform                                    | Aspect | Resolution |
| ------------------------------------------- | ------ | ---------- |
| Website, presentation, YouTube              | 16:9   | 1920×1080  |
| Reels, Shorts, TikTok, Stories              | 9:16   | 1080×1920  |
| Feed posts on Instagram, LinkedIn, Facebook | 4:5    | 1080×1350  |
| Square feed post or thumbnail loop          | 1:1    | 1080×1080  |

- Use 30fps by default, 60fps for screen recordings and fast movement, and 24fps only for a deliberately filmic look.
- Assume social video plays muted. Put the message in on-screen text and add captions for any speech.
- Vertical platforms cover the top and bottom of the frame with their own interface. Keep text and key content inside the middle area: about 250px clear at the top and 400px at the bottom of a 1080×1920 frame, and about 60px on each side.
- On 16:9, keep text within the central 90% of the frame.

## Concept

A motion piece shows things changing; a headline that slides in and is then replaced by the next one is a slide. Before the storyboard, decide in one sentence what the viewer watches happen, such as the product's real screen doing the task, a number building from its parts, an object transforming, or one continuous move through a space, and carry that visual through the beats. Text supports the picture: most beats should still make sense with the text covered. The text-led briefs below are the exception, since there the typography is the picture.

- Show the real thing. When the piece is about a product, use its real screens, footage, or assets, and ask for them when the brief does not include them. When none exist, say so and mark the substitute as a placeholder; invented interface built from dark rounded rectangles makes every product look the same.
- Use a sequence of text cards only when the brief is a title sequence, a quote, or kinetic typography, and then make the typography itself the picture: large, filling the frame, and moving with the meaning of the words.

## Storyboard

Write a table with one row per beat: start time, duration, on-screen text, what moves and how, and the sound cue. Then check it:

- Every beat carries one idea. A beat that needs two sentences of text is two beats.
- Every text gets time to be read: after it has fully arrived, hold it for at least 1 second plus about 0.3 seconds per word. Viewers read slower in motion than on a page.
- Every text adds something the earlier beats did not say, so cut any headline that restates the previous beat. Write each as a plain sentence, unless the words are given, such as a quote or a title sequence's credits; generated scripts fall back on two-fragment slogans ("Seven days. Seven pings.") and "X, not Y" contrasts. Use each of those patterns at most once in the piece.
- The first two seconds state what the video is about. On social platforms, most viewers decide within them whether to keep watching.
- The last beat holds the call to action or the logo for at least 2 seconds.

## Timing And Easing

- **One focus at a time.** At any moment, one element or one group is moving and drawing the eye. Supporting elements follow the lead element a few frames later, overlapping its end, rather than starting together with it.
- **Motion needs stillness.** Each element enters, holds, and exits. Constant movement leaves the eye nowhere to rest and nothing to read.
- **Never use linear easing for movement.** Use a strong ease-out, such as an exponential or quartic curve, for entrances, an ease-in for exits, and an ease-in-out for elements moving from one place to another. Use linear only for continuous motion, such as a rotation or a scroll.
- **Fit the entrance to the element.** A number counts or builds, a chart grows from its axis, a screen scrolls or zooms to the part that matters, a line of text reveals by line or word. One reveal, such as a masked slide-up, applied to every element reads as a template.
- **Pick one easing family for the piece.** Mixed curves read as inconsistency. Choose its character from the brand: sharp, quick curves feel confident and technical; long, soft curves feel calm and premium; overshoot and bounce feel playful.
- **Think in frames.** At 30fps, small elements move in about 8 to 15 frames, larger movements in 15 to 30, and scene transitions in 10 to 20. Movements shorter than 6 frames read as cuts.
- **Stagger with intent.** Offset items in a group by 2 to 4 frames, in reading order or from the point the motion originates.
- **Motivate transitions.** Carry an element from one scene into the next, match a shape or direction across the cut, or cut on a beat. Use a crossfade only when nothing connects the scenes.
- **Sync to sound.** When there is music, find its tempo and place major changes on beats: one beat lasts `60 / BPM × fps` frames.

## Composition

- Design every key frame as a still that works on its own: clear hierarchy, aligned edges, and one focal point.
- Use the whole frame. Size and place the focal element for the format, and balance the frame; a headline in the top-left corner with the rest of the frame empty is a slide layout, not a composition for video.
- Keep text large. On a 1080px-tall frame, keep body text at 40px or more and headlines at 80px or more; on vertical video seen on a phone, go larger. Check legibility by viewing a frame at phone size.
- Animate text by line or word for anything people must read. Animate by letter only for short display words, since letter-by-letter animation delays reading.
- Use the brand's fonts, colors, and assets, including the logo file for logo and end cards, never the name retyped in a font. When no logo file is supplied, put a box labeled as the logo placeholder where it goes, with no name set in type beside it, and ask for the file. Load fonts locally and confirm they render before any frame is captured.
- Without brand colors, take them from the subject, such as the product's interface, the place, or the material, and write in the storyboard which part of the subject each color comes from. Avoid the two palettes generated video falls back to, unless the subject's own colors produce one: a near-black ground with one bright accent, and a cream or off-white ground with dark ink. Moods such as "calm", "technical", or "paper-like" are not a source.
- Color a word in the accent only when that word is the point of the beat. Coloring the last word of every headline turns emphasis into decoration.
- Avoid decorative motion without meaning, such as floating particles, perpetual wobble, and lens flares, the motion equivalents of decorative noise.

## Render Setup

Any setup works when it meets three requirements:

1. **Time-driven.** The whole piece is a function of time: the setup can show the exact state of any frame on request, in any order. Animation driven by the clock, such as `requestAnimationFrame` loops, `setTimeout`, CSS animations left playing, `Date.now()`, or playing video in real time, drops and repeats frames when rendering takes longer than real time, which it always does.
2. **Deterministic.** Rendering the same frame twice gives the same image. Fonts are loaded and images decoded before the first frame, and any randomness uses a fixed seed.
3. **Exact frames out.** Each frame is captured at the output resolution with no scaling, then encoded.

When the project has no setup, use the default: a single HTML page with a fixed-size stage at the output resolution and one paused GSAP timeline holding the whole piece; a headless browser that seeks the timeline to each frame's time and captures a screenshot; and `ffmpeg` to encode the frames. Read [references/gsap.md](references/gsap.md) before building with GSAP or rendering frames from a browser. Check that GSAP's license covers the client's use before a commercial project; it is free to use but not open source.

When the project already uses another tool that meets the requirements, such as Remotion or Motion Canvas, use that tool and its own renderer instead.

## Encoding

- Deliver MP4 with H.264 and the `yuv420p` pixel format for broad compatibility, with `-framerate` set to the rate the frames were captured at: `ffmpeg -framerate 30 -i frames/%05d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart out.mp4`.
- For a transparent background, as with an overlay or a lower third, deliver ProRes 4444 (`-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le`) or WebM with VP9 (`-c:v libvpx-vp9 -pix_fmt yuva420p`), and capture the frames with a transparent background.
- For a GIF, generate a palette first (`palettegen` and `paletteuse` filters), keep it short, and reduce the frame rate and size; GIFs grow large fast.
- Mix audio in the same `ffmpeg` call, and trim the video and audio to the same length.

## Verification

Look at the output, not the code. Most timing and composition problems are invisible in code and obvious in frames.

- Make a contact sheet of one frame every half second, for example with `ffmpeg -i out.mp4 -vf "fps=2,scale=480:-1,tile=6x5" sheet%03d.png`, which writes one sheet per 15 seconds, and check the sequence: one focal point per frame, nothing cut off, nothing overlapping by accident.
- Extract every frame across each transition and each text entrance, and confirm the motion is smooth, with no jumps, flashes of unstyled or missing content, or frames where the wrong font appears.
- View the hold frame of every beat at phone size and confirm its text reads. Measure the smallest text the video adds against the sizes in Composition, including chart labels you set. Text inside real screens or footage keeps its own size; when the text that matters there does not read at phone size, zoom or crop to it.
- Check the first frame, which platforms often show as the thumbnail, and the last frame. The first frame must show the subject, not an empty background; start the piece with the first beat already partly in view when its entrance would leave frame 0 blank. For a loop, confirm the last frame leads into the first.
- Overlay the platform's safe area on the key frames and confirm nothing important falls outside it.
- On each key frame, draw the bounding box of the content, leaving out full-frame backgrounds and the safe-area overlay. It should span at least half the safe area's longer side: its height on 9:16 and 4:5, its width on 16:9, and either side on 1:1. When it does not, enlarge or re-place the content, unless the emptiness is the point of the beat and the storyboard says so.
- Confirm the file's duration, frame rate, resolution, and codec with `ffprobe`. For a video file, confirm the frame count equals duration times frame rate; for a GIF or an image sequence, confirm it equals the number of frames rendered.
- Fix each failure, then render again. A failed check, such as a hold shorter than the minimum or a blank first frame, is not an open decision to hand to the client.
- When the output cannot be rendered or inspected, say so and name what was not checked.

## Presenting

Deliver the rendered file, the storyboard table, a poster frame as an image, and the source project. State the main decisions with one reason each: the easing character, the pacing, and how transitions connect the scenes.
