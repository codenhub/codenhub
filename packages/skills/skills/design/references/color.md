# Color

## Contents

- Roles Before Swatches
- Neutrals
- Accent And Brand
- Choosing A Hue
- Building Scales
- Color Theory As Reasoning
- Contrast And Accessibility
- Dark Mode
- Status And Data Colors
- Color Across Media

## Roles Before Swatches

Define colors by the job they do, not by how they look in isolation:

- **Surfaces:** the page background and one to three raised or recessed surfaces.
- **Text:** primary, secondary, and disabled.
- **Lines:** borders and dividers, subtle and strong.
- **Accent:** the primary action, selection, links, and focus.
- **Status:** success, warning, danger, and info, only where those states exist.

Build the neutrals first; they cover most of any surface. Then add one accent, then status colors as needed. A palette that starts with five brand hues has nothing left to say what is important.

## Neutrals

- Tint neutrals slightly toward a hue, usually the accent's or a warm or cool direction, to give the palette character. In OKLCH, a chroma around 0.005–0.02 reads as gray with a temperature, not as color.
- Pure black text on pure white is harsh on large reading surfaces; a near-black and an off-white soften it while keeping contrast high. Small interface text is fine at full contrast.
- Separate surfaces with small lightness steps, a few percent, before reaching for borders or shadows.
- Mark secondary text with one change, usually a lighter color. Stacking smaller, lighter, and italic overshoots. Check that it still passes 4.5:1.

## Accent And Brand

- Use one accent for action and selection. If links, buttons, icons, headings, and backgrounds all carry it, it stops marking anything.
- A brand color is not automatically an interface color. A color chosen for a logo may fail contrast as a button fill, or be too saturated for large areas. Derive lighter and darker steps from it, use it at full strength in small doses such as the logo, the main action, and one highlight, and use a tint or shade wherever contrast requires it.
- When the brand color fails contrast against white text in every usable shade, use dark text on it, or keep it as a decorative color and choose a related, darker accent for actions.
- Before introducing a second accent, check whether a lighter or darker step of the first would do the job.

## Choosing A Hue

When no brand exists, choose the accent against the field: note the colors that competitors or neighboring products in the same space use, then pick one that differs from them and fits the content and the audience. State which ones you compared and how the choice differs. When you can search the web or open those products, look at them before choosing. Only when they cannot be inspected, or there is no competitive field, state that limitation and choose a provisional accent from the content and audience; do not claim a comparison or distinctiveness. Choosing by mood lands on the defaults that mark work as generated: the indigo and violet of popular CSS frameworks, the purple-to-blue gradient, a cream ground with an orange, rust, terracotta, or copper accent, a near-black or slate ground with one bright accent, and deep green or teal.

- Hue associations are weak and cultural. Blue reads as trust and default (and therefore generic), green as growth, money, or go, red as danger or urgency in many places and as luck in others. Use them as one input, not a rule.
- Saturation and lightness carry more meaning than hue. Muted and darker colors read as serious, calm, or premium; bright, saturated colors read as energetic and young, and as cheap when they cover everything.
- Check the conflicts. An accent in the same hue family as danger or success makes ordinary buttons look like warnings or confirmations.

## Building Scales

- Build ramps in OKLCH or OKLab, where equal steps in lightness look equal. In HSL, yellow and blue at the same lightness value differ hugely in how light they look, so ramps built there come out uneven.
- Hold the hue, step the lightness evenly, and reduce chroma toward the lightest and darkest steps, where high chroma falls outside the screen's gamut and looks garish.
- Watch for hue drift: some hues shift as they lighten or darken, such as blue toward purple. Correct the hue per step until the ramp reads as one color.
- Use about 10–12 steps per ramp, and map steps to roles consistently: the lightest for backgrounds, the next for subtle fills and borders, a middle step for the solid accent, and the darkest for text in that hue.
- Modern browsers support `oklch()` in CSS. Add sRGB fallbacks only when the project's supported browsers require them.

## Color Theory As Reasoning

Use color theory to predict what a combination will do, not as a recipe.

- **Value first.** The lightness structure carries the image. Convert the design to grayscale: if the hierarchy fails in gray, color will not fix it.
- **Harmony schemes are vocabulary.** Complementary, analogous, and triadic schemes describe palettes; they do not make one good. Most strong palettes are one hue family plus neutrals plus one contrasting accent.
- **Temperature.** Warm colors advance and cool colors recede. A warm accent on cool neutrals stands out without needing much saturation.
- **Simultaneous contrast.** A color looks different on different backgrounds. Check the accent on every surface it sits on.
- **Proportion.** A rough 60/30/10 split between the dominant color, a secondary color, and the accent is a useful check that one color leads. It is not a target.

## Contrast And Accessibility

- **WCAG 2 thresholds:** 4.5:1 for all text below the large-text size, including labels, buttons, and captions; 3:1 for text at least 24px or at least 18.66px bold; 3:1 for meaningful non-text UI, such as input borders, icons, and focus indicators, against what is next to them. Logotypes, purely decorative text, and incidental text inside photos are exempt. For long reading, aim for 7:1.
- **APCA as a second opinion.** The WCAG 2 formula misjudges some pairs, especially light text on dark backgrounds and mid-tone colors. Where it is available, check with APCA as well, aiming for about Lc 75 for body text, Lc 60 for other content text, and Lc 45 for large headings. Meet WCAG 2 wherever it is a legal or contractual requirement.
- **Never color alone.** Pair color with text, an icon, a pattern, or position wherever it carries meaning. About 8% of men of Northern European descent have a color vision deficiency, most often red-green. Check the work with a color-blindness simulation.
- **Disabled elements** are exempt from contrast requirements, but should still be visible enough that people can tell the element exists.

## Dark Mode

- Do not invert. Rebuild the palette for dark surroundings.
- Use near-black surfaces tinted like the neutrals, not pure black, except for true-black designs aimed at OLED screens.
- Show elevation with lighter surfaces, not shadows; shadows barely show on dark backgrounds.
- Lower the saturation and raise the lightness of accents. Saturated colors vibrate against dark backgrounds.
- Use off-white text, around 90% lightness, not pure white, and consider one weight lighter for body text.
- Check every color pair again. Contrast does not carry over between themes.

## Status And Data Colors

- **Status:** follow convention, which is red for danger, amber for warning, green for success, and blue for info. Keep status colors visibly distinct from the accent, and pair each with an icon or label.
- **Categorical data:** colors that differ in lightness as well as hue, so they still separate in grayscale and for color-blind viewers. Past six to eight categories, color stops working; label directly or group instead.
- **Sequential data:** one hue, ramped in lightness.
- **Diverging data:** two hues meeting at a neutral midpoint that means something, such as zero or the average.

## Color Across Media

- **Video and social media:** compressed, shown on uncalibrated phones, and seen in a feed beside other content. Use strong lightness contrast and few colors. Avoid fine colored detail and thin saturated red, which video compression smears.
- **Print:** the CMYK gamut is smaller than a screen's. Saturated RGB blues, greens, and oranges print dull, so convert and proof before committing to them.
- **Projected slides:** projectors wash out contrast and shift color. Use stronger contrast than on screen, and avoid light text on mid-tone backgrounds.
