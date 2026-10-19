---
name: design
description: Guides visual design decisions in any medium, including typography and font choice, spacing and density, layout and alignment, hierarchy, color and palettes, and contrast. Use when building, restyling, or reviewing a UI, web page, component, dashboard, landing page, app screen, email, slide, social media image, thumbnail, poster, video frame, or motion graphic, when choosing fonts or colors, or when something looks generic, cluttered, off, or obviously AI-generated.
---

# Design

Design is a set of decisions that make content easy to read, use, and remember for a particular audience in a particular medium. Every visual property, such as size, weight, space, color, position, and motion, tells the viewer something: what matters, what belongs together, and what to do next. A property that tells them nothing is decoration, and decoration applied by default is what makes generated work look generated.

The usual failure is not missing knowledge. It is choosing before reasoning: picking a font, a palette, or a style first, then pouring the content into it. Work the other way. Content and context decide the hierarchy, and the hierarchy decides type, space, and color.

## Existing Systems First

In a product with a design system, brand guide, or established screens, use its tokens, components, fonts, spacing, and motion. A screen that departs from the rest of the product reads as a bug, not as design. Apply this guidance to what the system leaves open, such as composition, hierarchy, density, and empty, loading, and error states. When following the system would ship an accessibility failure, such as text that fails contrast, use the nearest value from the system's own scale that passes, and report the problem so the system can be fixed for every screen. For other conflicts with this guidance, follow the system and report the problem instead of quietly working around it.

## Procedure

1. **Context.** Establish the medium (screen UI, document, slide, social image, video, print), the viewing conditions (size, distance, seconds on screen, surroundings), the audience, and how often they see it. A tool used all day and a page seen once for ten seconds need opposite answers to most questions below. When the request leaves these open, infer them from the content and state the assumption.
2. **Content.** Work with real or realistic content before styling it. Placeholder text hides length, wrapping, and hierarchy problems. Rank it: the one thing the viewer must get first, what supports it, and what is reference. Most surfaces need three levels of importance or fewer; past that, levels blur together.
3. **Constraints.** Accessibility, platform conventions, languages and scripts, licenses, performance budgets, and brand.
4. **Type.** Choose type before color, since most of any interface is text. Read [references/typography.md](references/typography.md) before choosing a typeface, pairing fonts, building a type scale, or setting text for video or social media. When the typeface is not already set by the system or brand, shortlist at least three from at least two different constructions, judge them against the reference's criteria, and say why the winner beat the others.
5. **Space and layout.** Apply the next two sections.
6. **Color.** Read [references/color.md](references/color.md) before building a palette, choosing an accent or working with a brand color, setting up dark mode, or choosing colors for status or data.
7. **Check.** Follow Verification below before presenting the work.

## Hierarchy

Signal importance with the fewest and weakest means that work, in this order: position and reading order, space, size, weight, color, and only then decoration such as borders, backgrounds, shadows, and icons. Reaching for decoration first causes most generated clutter: a card, a badge, and a gradient where an extra line of space and a heavier weight would do.

- Use one signal per distinction, and make it obvious. Two sizes 2px apart look like a mistake, not a hierarchy. Add a second signal only when the first cannot do the job alone. Meaning carried by color is the exception: it always needs a second, non-color signal, such as an icon or a word.
- Demote as often as you promote. Making secondary text smaller or lighter often fixes a page better than making the headline bigger.
- One primary action per view. When everything is emphasized, nothing is.
- Restraint is not the goal. Removing default decoration leaves room for one deliberate focal element taken from the content, such as a large real number, a product view, a diagram of how it works, or a striking headline. Make it big and finished enough to carry the surface; a timid visual with tiny labels is as weak as a decorative one.

## Space And Layout

- **Space is grouping.** Elements close together read as related. Space inside a group must be clearly smaller than space between groups; a label sits closer to its own field than to the previous field. Uniform spacing everywhere erases grouping, and is the most common reason a layout looks off without anyone being able to say why.
- **Density follows the task.**
  - Compact for repeated, expert, or scanning work: tables, dashboards, editors, admin tools, settings, and inboxes. People who use a screen daily want more of it visible and learn where things are; padding costs them scrolling.
  - Generous for one-time, first-impression, or single-decision moments: landing pages, onboarding, empty states, checkout, a hero, a slide, a poster. Space isolates the one thing and slows the reader down.
  - Most products mix both: compact content inside a generous page structure.
- **Use a spacing scale** such as 4, 8, 12, 16, 24, 32, 48, 64, 96, and choose a step by the relationship between elements, not by feel per element.
- **Step the gaps by level.** Within an item, between items, between groups, and between sections each need a clearly larger gap than the level below, roughly 1.5 to 2 times. A gap between groups that nearly matches the gap between sections makes the groups read as sections, and the section loses its outline.
- **Give parallel content parallel form.** Siblings at one level share a heading style, a heading position, and a layout pattern. When one group is two lists, the next a key-value table, and the next a block with its heading in a side column, each reads as a different kind of thing. Label every group at a level, or none of them.
- **Share a grid.** Siblings align to the same column edges. Columns that change proportions from one group to the next leave the eye no axis to follow.
- **Align to few edges.** Every distinct left edge is one more line the eye tracks. Left-align text people read. Center only short, standalone, symmetric content, such as a hero line, a slide title, or a button label.
- **Keep reading text between 45 and 75 characters per line.** Wider lines lose the reader on the return sweep; narrower ones break phrases apart.
- **Align optically.** Round shapes, icons, triangles, and punctuation need nudging to look aligned; trust the rendered result over equal numbers.
- **Design for the extremes.** Long names, empty lists, one item, a thousand items, a narrow phone, a wide monitor, and translated text. Translations often run about 30% longer than English, and short labels can double; when the target languages are known, test with them.

## Separation

Every line, border, background change, and shadow claims that space alone could not separate or group what is around it. Generated layouts make that claim everywhere: a hairline between every metric, row, and section, and a card with a border, a tinted background, and a shadow at once. Each boundary ends up drawn two or three times, and the result reads as noise.

- **Start with space, and make it carry the structure.** Removing a separator is right only when space, alignment, and headings still show what belongs together. If the structure disappears with the line, strengthen those first. Add a visible separator only where they cannot do the job: rows that must be tracked across a wide table, regions that meet edge to edge, such as a sidebar against content, layouts too dense to spare the space, and controls whose bounds people must see, such as inputs.
- **One means per boundary.** A container is a border, a background change, or a shadow for elevation, not all three. A section break is space, a rule, or a background band, not a rule inside a band after a large gap. When choosing, prefer the weaker means: space, then a background change, then a line, then a shadow.
- **Choose the vocabulary once.** Decide how the whole surface separates and groups, then apply that everywhere it applies and nowhere else. A design built on lines can be excellent, as on code hosts and documentation sites, when every line marks a real edge: a grid cell, a table axis, a panel boundary. The failure is a line placed wherever one could go.
- **Draw complete, honest shapes.** Lines describe structure. A top border on each card with no other sides, dividers between some items but not their siblings, and a rule shorter than what it separates all suggest a structure that is not there. Close the shape, use one continuous rule, or use space.

## Default Failures

Generated design converges on the patterns below. Each is wrong as a default, and some are right in a specific case. Use one only when that case applies, and be able to say why.

- **Lines wherever one fits.** Hairlines between every metric, row, and section; top-only borders on cards; a divider, a gap, and a background change at the same boundary. See Separation.
- **A card around everything.** A border, radius, and shadow around every section, metric, and paragraph. Cards are for discrete objects a person acts on or moves between, such as a product, a message, or a file. Separate sections with space and headings.
- **Soft, tinted, or wide shadows everywhere.** A shadow means elevation: something sits above the page, like a menu, dialog, or dragged item. Keep shadows small, neutral, and on few elements. Separate flat surfaces with a slight change in lightness.
- **Glow, neon, and gradients for energy.** Glow means emitted light, and gradient text and purple-to-blue backgrounds are the signature of generated UI. Use flat color. Use a gradient when it represents something, such as a range, light, or an existing brand asset.
- **Uppercase everywhere.** Small tracked-out labels above every heading, uppercase buttons, uppercase headers. Uppercase slows reading and loses word shapes. Reserve it for one level of very short labels, and track it out slightly.
- **Emoji as icons or bullets.** Emoji render differently on each platform, carry a tone you did not choose, and read as casual. Use one icon set with a consistent stroke and size, or no icon. Add icons where they speed recognition, such as navigation and repeated actions, not beside every heading.
- **Saturated everything.** Full-strength color on large areas, several accents competing. Saturation is emphasis; spend it on what should be noticed first.
- **Everything centered.** Centered paragraphs, forms, and grids of identical items. See Space And Layout.
- **The reflex font.** Inter, Roboto, or a system stack because it came to mind first, or a fashionable display face picked to avoid them. Either can be right; neither is right by default.
- **Large radius on everything.** Radius is a personality decision. Use one or two values, and nest them: an inner radius equals the outer radius minus the padding between them.
- **Decorative noise.** Blobs, grain, mesh gradients, floating 3D shapes, and frosted glass layered behind content that has no image of its own. Use real content as the visual, such as product screenshots, photos, or data, or let type and space carry the page.
- **Crude illustration.** A hand-drawn SVG of the subject, such as a loaf, a laptop, or a server, that reads as a blob or as a different object. A weak drawing costs more than no drawing. Keep one only when it reads as the thing at a glance at the viewing size; otherwise let type carry the piece, or use a simple, recognizable symbol.
- **Filler content.** Lorem ipsum, "John Doe", suspiciously round metrics, and three identical feature columns of icon, heading, and sentence. Use realistic content in realistic, uneven amounts.
- **Motion by default.** A fade-up on every section and a scale on every hover. Motion explains change: where something came from, what responded, what is loading. Use it there, keep it short, and respect the reduced-motion preference.

## Verification

Look at the output before presenting it. Most design failures are obvious in a rendered image and invisible in code.

- Render the work and view it at its real size. For UI, capture a narrow phone width and a common desktop width. For social images and video, view them at the size people meet them, such as a feed thumbnail on a phone.
- For social images, thumbnails, and posters, also view a copy scaled to about a quarter of its width. The main message must still read.
- Blur or squint at it. You should see a few distinct blocks, with clearly larger gaps between groups than within them, and the order in which things stand out must match the ranking from the Content step. Without reading, count the sections and the groups in each; if you cannot, the structure is not visible yet.
- Check that every heading and label sits closer to what it labels than to the item before it. Margins from different elements add up, so a title can end up nearer the previous description than its own.
- Check contrast numerically: at least 4.5:1 for all text below the large-text size, including labels, buttons, and captions, and 3:1 for text at least 24px (or 18.66px bold) and for meaningful non-text UI such as input borders, icons, and focus rings.
- Check the smallest text, including labels inside diagrams, charts, and illustrations. Keep it at 12px or larger on screen; text that only works at full zoom is not working.
- Check every state and variant that exists: hover, focus, active, disabled, empty, loading, error, overflowing content, and both themes when there is a dark mode.
- Remove each line, border, background change, and shadow in turn, in the render or in your head. Keep it only when grouping becomes unclear without it, then check that the ones that remain follow one consistent rule.
- Compare the result against Default Failures and remove each one that has no reason to be there.
- When the work cannot be rendered, say so and name what was not checked.

## Presenting Decisions

When presenting the work, state the main decisions with one reason each: the typeface, the density, the accent color, and any deliberate exception to Default Failures. One line each is enough. Stated reasons make the choices reviewable, and a choice with no reason to state was probably a reflex.
