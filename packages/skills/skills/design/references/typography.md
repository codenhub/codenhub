# Typography

## Contents

- Roles
- Choosing A Typeface
- Voice By Construction
- Font Choice Failures
- Pairing
- Type Scale
- Setting Text
- Text In Video, Motion, And Social Media

## Roles

Start from the jobs text does in the work, not from a typeface you like. Name each role present:

- **Reading:** paragraphs, articles, documentation, long descriptions.
- **Interface:** labels, buttons, menus, inputs, and table cells, usually at 12–16px.
- **Display:** headlines, hero lines, slide titles, thumbnails, and posters, at large sizes and few words.
- **Data:** numbers in tables, metrics, timers, prices, and code.

One family usually covers every role. Add a second only when one role needs something the first cannot do, such as a serif for long reading beside a sans interface, or a monospace face for code.

## Choosing A Typeface

Evaluate candidates in this order. The first four are pass or fail; voice decides among the candidates that pass.

1. **Function at the real size.** Set the actual strings at the actual size and look. For interface and small text, prefer a large x-height, open apertures in `a`, `c`, `e`, and `s`, generous spacing, and distinct `I`, `l`, and `1` and `O` and `0`. High-contrast and tightly spaced display faces break down below about 20px.
2. **Coverage.** Every language and script the content uses, including accented Latin, Cyrillic, Greek, and a fallback for CJK or Arabic. Every feature the content needs: tabular and lining figures for data, a true italic, and the symbols and arrows in use.
3. **Weights.** Enough weights for the hierarchy, usually regular, a medium or semibold, and bold. A variable font gives any weight in one file. Never rely on synthesized bold or italic; the browser fakes them badly.
4. **Availability and license.** Check that the license covers the use: web embedding, app bundling, video, or print. Open-licensed fonts (SIL Open Font License) are the simplest. Never assume a commercial font is installed or licensed. Give every web font a fallback stack with similar metrics, so text does not jump while loading.
5. **Voice.** Choose the voice from the audience and the register of the content, as described next.

The platform's system font stack is a legitimate choice for tools, admin panels, native-feeling apps, and tight performance budgets: it matches the operating system, costs no download, and stays out of the way. It is a weak choice where the work must be recognized, such as a brand site, a campaign, or a cover.

## Voice By Construction

Typefaces communicate through how their letters are built. Adjectives like "modern" or "elegant" do not pick a font; construction does. Classify each candidate by its letters, then judge whether that construction fits.

- **Neo-grotesque sans**, such as Helvetica, Inter, Roboto, and the system UI fonts: closed apertures and uniform strokes. Neutral and everywhere. It disappears, which is right for dense tools and wrong when the work needs a recognizable identity.
- **Humanist sans**: open apertures, some stroke modulation, and proportions from handwriting. Warmer and more readable at small sizes; suits approachable products, public services, and long interface text.
- **Geometric sans**: near-circular bowls, single-story `a` in many, and straight, even strokes. Confident and brand-forward at display sizes; tiring in long text, where the round letters blur together.
- **Grotesque and industrial sans**: older and more irregular than neo-grotesques, often in condensed widths. Suits editorial headlines, signage, and work that should feel direct.
- **Serif, old-style and transitional**: bracketed serifs and moderate stroke contrast. The strongest choice for long reading. Signals editorial weight, tradition, and authority.
- **Slab serif**: heavy, square serifs with little stroke contrast. Sturdy and mechanical, sometimes friendly; survives low resolution and distance well.
- **Monospace**: every glyph the same width. For code and fixed-width data. As the main face of a whole interface it reads as a developer tool, which is right for developer tools and a costume elsewhere.
- **Display, script, and novelty faces**: one role only, such as a headline or a title card. Never body text.

## Font Choice Failures

- Choosing the font before knowing the roles, the content, and the audience.
- A neutral neo-grotesque by reflex for work that needs an identity, or a fashionable display face by reflex to avoid looking generic. The same handful of trendy faces appears across generated work; a font picked to seem distinctive becomes the new default.
- Shortlisting only the first faces that come to mind. Most generated work draws from the same few dozen families; when every candidate is one you have seen used everywhere, look further.
- Pairing two fonts of the same classification, such as two geometric sans faces. They look almost the same, so the pair reads as a mistake.
- More than two families. A third almost never earns its place outside a code face.
- A display face at body size, or a thin weight (100–300) below about 24px.

## Pairing

1. Try one family first, using weight, size, and color for contrast. A superfamily with matching sans and serif designs extends one family when you need a second voice.
2. When two families are needed, contrast them on one axis and match them on others. A serif display over a sans body works when the two share similar proportions and x-height. Two fonts that differ on everything clash; two that differ on nothing look like an error.
3. Give each family a fixed set of roles, and keep to them.

## Type Scale

Derive the scale from the hierarchy, not from a ratio picked in advance.

1. Set the body size first: 16–18px for reading on the web, 14–16px for dense interfaces, and at least 12px for secondary metadata. On phones, keep inputs at 16px or larger; smaller inputs make iOS Safari zoom on focus.
2. Count the levels the content actually has, then space the sizes so neighboring levels differ visibly. A ratio of about 1.125–1.2 suits dense interfaces with many levels, and 1.25–1.5 suits editorial pages, marketing, and slides with few levels.
3. Keep the set small, about four to six sizes for most products. Make distinctions within one size with weight or color.

## Setting Text

- **Line height** around 1.4–1.6 for body text, more for wider lines and less for short ones, and 1.0–1.2 for large headings.
- **Letter spacing** leaves body text alone. Tighten large display text slightly, around −0.01 to −0.03em, and loosen small uppercase labels by about 0.05–0.1em.
- **Weight on dark backgrounds.** Light text on a dark background looks heavier and blooms. Consider one weight step lighter, and avoid thin weights there entirely.
- **Figures.** Use tabular figures wherever numbers align or change, such as tables, metrics, prices, and timers, with `font-variant-numeric: tabular-nums` in CSS. Right-align numeric columns, and left-align text columns.
- **Characters.** Use real quotes and apostrophes, en dashes for ranges, the ellipsis character, the multiplication sign for dimensions, and a non-breaking space between a number and its unit.
- **Line breaks.** Balance headings so a single word is not stranded on the last line, with `text-wrap: balance` in CSS, and use `text-wrap: pretty` on paragraphs.
- **Italic and bold** are for emphasis within text, not for whole paragraphs. Underline is for links.

## Text In Video, Motion, And Social Media

- **Size for the smallest view.** A social image is judged as a feed thumbnail on a phone; a video frame on a phone held at arm's length. Text must stay readable with the image shrunk to about a quarter of its width. That usually means few words, large and heavy.
- **Few words per frame or slide.** One idea per frame. A headline over about seven words becomes a paragraph nobody reads in time.
- **Reading time.** Keep text on screen long enough to read, about 15–17 characters per second for adult viewers, and never under about 1.5 seconds for even a short line.
- **Survive compression and motion.** Heavier weights and large x-heights hold up; hairline strokes, fine serifs, and small text shimmer, blur, and break up in compressed video.
- **Legibility over busy footage.** Put text where the background is calm, or behind a solid or semi-opaque band. Do not add a glow or heavy outline.
- **Safe zones.** Vertical-video and social platforms cover parts of the frame, mostly the bottom and the right edge, with captions, buttons, and profile details. Check the target platform's current safe-zone guidance and keep text and faces inside it.
- **Animate readable units.** Animate whole words or lines that are meant to be read. Letter-by-letter animation is for short titles where the motion itself is the point.
