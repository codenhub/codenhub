---
name: logo-design
description: Designs logos and marks, including wordmarks, lettermarks, monograms, symbols, combination marks, emblems, favicons, and app icons, from concept ideation through drawn SVG files and usage rules. Use when asked to create, redesign, refine, or critique a logo, logotype, mark, symbol, or icon for a brand, product, company, or project, or to explore logo concepts and directions.
---

# Logo Design

A logo is a signature, not an illustration. It identifies; it does not explain what the business does. Its job is to be recognized at a glance, remembered after one look, and reproduced cleanly from a 16px favicon to a building sign, in one color as well as in full color.

Generated logos fail in predictable ways: a literal picture of the business (a wheat stalk for a bakery, a circuit brain for AI), an initial letter or a stack of basic shapes standing in for an idea, a freehand SVG drawing that reads as a blob, the first font that came to mind with no spacing work, a gradient that carries the idea, `<text>` left in the final file, and a single option presented as the answer. Work from the idea first, choose forms you can execute precisely, and check the mark at every size it will meet.

## Existing Identity First

When the brand already has a logo, a refinement keeps what people recognize, such as the shape, the color, or the letterform, and fixes what is broken: spacing, detail that fails at small sizes, inconsistent versions. Replace a mark only when asked to. A redesign that discards recognized equity costs the client that recognition.

## Procedure

1. **Brief.** Establish the name, what it names, the audience, the personality in a few words, the competitors, and where the mark will live: app icon, favicon, avatar, signage, print, embroidery, product, video. When the request leaves these open, infer them and state the assumptions.
2. **Competitors.** Look at the marks of five or more competitors or neighbors in the category. Note the shapes, colors, and type they share. A logo that blends into its category is not recognized; differ on purpose. Without web access, list the competitors and category conventions you know and say they were not researched. Write these notes down before ideation and include them in the presentation. Do not skip this step.
3. **Mark type.** Choose it from the use, as described in Choosing The Mark Type.
4. **Ideas in words.** Generate concepts as written one-line ideas before drawing anything, as described in Ideation.
5. **Routes.** Pick three routes from concepts whose swap fits only this brand, and that differ in idea, not three variations of one idea. At most one route may be built on the name's initial letter, and that route must change the letter to carry an idea; an initial set in a typeface, alone or in a shape, is not a concept. Draw each in black on white first.
6. **Construction.** Build each route precisely, as described in Drawing In SVG and Wordmarks.
7. **Refine.** Add color, build lockups and the small-size version, and finish the chosen route.
8. **Check.** Follow Verification below, then present as described in Presenting.

## Choosing The Mark Type

- **Wordmark:** the name set as the logo. The default for a new or unknown name, since every view teaches the name. Needs a name short enough to stay legible small; long names suit it poorly.
- **Lettermark or monogram:** initials or one letter. For long names, names already known by their initials, or when a compact mark is needed for icons.
- **Combination mark:** a symbol with a wordmark, usable together or apart. Choose it when the brand needs a standalone mark, such as for an app icon, an avatar, or a favicon, and can spend the time teaching people that the symbol means the name.
- **Symbol alone:** only for brands people already know, or as the compact version of a combination mark.
- **Emblem:** the name inside a badge or seal. Suits heritage, institutions, and merchandise. It fails at small sizes, so it always needs a simpler compact version.

## Ideation

Write at least twenty one-line concepts before choosing. Spread them across routes, since the first ideas are the ones every competitor and every generator had too:

- **The name itself:** its meaning, its sound, its letters, a wordplay, a hidden shape in its letterforms.
- **Letterform manipulation:** a cut, a ligature, a shared stroke, negative space between letters.
- **The product's truth:** what the thing literally does or how it behaves, abstracted to a shape or a motion.
- **Metaphor:** an object or idea that stands for the brand's promise, reduced to its simplest form.
- **Abstract:** a shape, pattern, or rhythm chosen for its feeling, justified by the personality.

Discard concepts that land on category clichés unless the brief gives a real reason to keep one: a lightbulb for ideas, a globe for international, gears for engineering, a leaf for sustainability, a shield or padlock for security, a speech bubble for communication, a brain, circuit, or sparkle for AI, a rocket or upward arrow for growth, connected dots for networks, concentric arcs or waves for signal, a swoosh, an initial in a rounded square, a letter replaced by a picture of the product (a bean for an "o", a drop for an "i"), and an arrangement of circles, squares, and triangles whose only idea is being geometric.

For each surviving concept, write one sentence that explains the idea. A concept that cannot be explained in one sentence will not be understood in one glance. Then swap in a competitor's name: when the concept and its sentence would serve that competitor as well, it is about the category, not this brand; discard it, even when a detail of the brand's story could be added to rescue it. Record each result as "fits only [brand]" or "fits [competitor] too"; "passes" and "fails" get read both ways.

## Drawing In SVG

Agents draw precise geometry well and freehand shapes badly. Design concepts that a precise construction can carry.

- Geometry is how a mark is built, not what it means. Build marks from geometric primitives on a grid: circles, rectangles, and straight or circular-arc paths, with integer coordinates on a grid such as 24 or 48 units. Reuse a small set of radii and stroke widths throughout the mark.
- Do not draw recognizable organic subjects, such as animals, faces, hands, plants, or objects, freehand. When a concept depends on one, reduce it to a few geometric parts that still read as the subject at the smallest size, or present it as a direction for an illustrator or an image model rather than shipping a crude drawing.
- Correct optically. Round shapes overshoot flat ones slightly to look the same size, horizontal strokes are slightly thinner than vertical strokes to look equal, and pointed shapes extend past the baseline. Trust the render over equal numbers.
- Make the final file solid fills. Convert strokes to outlines, merge overlapping shapes that share a fill, keep intentional layers and knockouts, and remove geometry that is truly hidden, so the mark scales without changing weight and renders the same everywhere.
- Keep the file clean: a `viewBox` fitted to the mark, no transforms left on groups where coordinates can be baked in, no embedded raster images, no external references such as linked files, stylesheets, or fonts (local `#id` references are fine), no unused definitions, and no editor metadata.

## Wordmarks

- Start from a real typeface chosen for the personality, with a license that permits logo use. Open-licensed fonts (SIL Open Font License) permit it; check the license of any commercial font before using it in a logo.
- Set the name and space it by hand. Default spacing is designed for running text, not for one word at display size. Adjust every letter pair until the gaps look even, and track the word tighter or looser to suit the size it will be seen at. Record each adjustment in the presentation, pair by pair, with its value. A wordmark with no recorded adjustments has not been spaced, and "default metrics kept after review" is not a record.
- Customize at most one or two details, and only where the change carries the idea, such as a ligature, a cut, or one modified letter. Every modification must survive at the smallest size.
- Convert the text to outlines in the final file, with a font tool or a vector editor's text-to-path conversion. A logo file that contains `<text>` depends on fonts installed on the viewer's machine and will render differently or not at all.
- When no conversion tool is available, construct the letters as geometric paths on the same grid as the mark, which suits short names and geometric styles. When the name needs a real typeface, deliver the wordmark with `<text>` as a clearly labeled working file, state that outlining is still required, and never present it as final. Do not drop the wordmark from the delivery.
- Check case and spelling against how the brand writes its name.
- A lockup is the mark and the name. Add a descriptor line, such as a category or a founding year, only when the brief asks for one; it is not part of the logo by default.

## Color

- Design in black first. A mark that only works in color does not work.
- Use one or two colors. Each additional color adds cost in print and embroidery and reduces recognition.
- Choose the color from the brief and the competitor notes. Generated logos default to an orange, rust, or copper accent, and to indigo or violet for technical products. Use one of these only when competitor notes from marks you actually looked at show it is unclaimed, and write that reason in the presentation. Without such notes, choose another color; an unverified guess that the color is free is not a reason.
- Provide a one-color version, a reversed version for dark backgrounds, and the full-color version. Build each version by deciding which parts become light and which become knockouts, not by swapping fill values: a part drawn in the background's color disappears. Gradients, glows, and shadows can decorate an application of the logo but never carry the mark itself.
- Check every version on each background it will sit on, including the brand color, and confirm that every part of the mark is still visible.

## Small Sizes

At 16 to 32px, thin strokes vanish, close shapes merge, and counters fill in. When the full mark loses its idea at those sizes, draw a simplified small version with thicker strokes, fewer parts, and wider gaps, rather than shrinking the full one. Remove any detail, stroke, or gap that would be smaller than about 2px at the target size, since it renders as a blur or disappears. App icons and favicons usually need the symbol alone, filling most of the available square; use a single letter only when the logo is a wordmark or lettermark.

## Verification

Render the work to images and look at them before presenting.

- View each route at 16, 32, 64, and 256px and at large size. The idea must still read at 32px, and the mark must still be recognizable at 16px. When any detail, stroke, or gap falls under about 2px at 16px, draw and deliver the small version described in Small Sizes; noting the problem is not enough.
- View it on white, on black, on the brand color, and on a busy photograph.
- View the one-color and reversed versions.
- For each render, write down what you see, part by part, before comparing it with what was intended. A part that vanished, merged, or reads as a different shape is a defect: fix it, or drop the route, before presenting. Do not present a route with a known broken construction.
- Blur or squint. The silhouette alone should be distinctive.
- Place it beside the competitor marks from step 2. It should not look like any of them, or like the category average.
- Check that it does not closely resemble a well-known logo. You cannot clear a trademark; say that a trademark search by a qualified person is still needed before the client adopts it.
- Confirm the presentation holds the spacing record from Wordmarks and, for each route, a competitor swap recorded as fitting only this brand. When a record is missing, do that work before presenting. When a route fits a competitor too, draw another concept from the list in its place; presenting it with the failure flagged as a risk, or listing the missing route as a gap, is not enough.
- Open the final SVG and confirm it has no `<text>`, no raster images, no strokes that should be fills, and a fitted `viewBox`.
- Compare the result against the failures listed at the top and remove each one that has no reason to be there.

When the work cannot be rendered, say so and name what was not checked.

## Presenting

Write the presentation as a document delivered with the files, such as a Markdown file or an HTML page that shows the SVGs. Logo files without it leave the client with no reasoning and no rules. It contains the competitor notes from step 2, the concept list from Ideation, the routes, and the usage rules.

For each route, show:

- The idea in one sentence, before the mark, and the competitor swap from Ideation: which competitor's name was tried and why the idea does not fit it.
- The mark in black on white, then in color, on light and dark backgrounds.
- The mark at real small size, such as a browser tab or a phone home screen, and in one or two realistic applications.

For the chosen route, deliver:

- SVG files for the primary logo, the symbol alone when there is one, horizontal and stacked lockups when needed, and one-color black and white versions of each.
- PNG exports at the sizes the client needs, and favicon and app icon files when relevant.
- Usage rules: clear space defined by a part of the mark, minimum size in pixels and millimeters, color values, and two or three real misuses to avoid.
