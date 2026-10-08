---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
---

Build distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## Existing Codebases

In a codebase with a design system, work within it: its tokens, components, fonts, spacing, and motion. A screen that departs from the rest of the product reads as a bug, not as design. Apply the guidance below to what the design system leaves open, such as composition, hierarchy, and empty or loading states, and to the framework patterns already in use.

Everything after this section applies in full to new projects, standalone pages, and surfaces the user asks to restyle.

## Design Thinking

Before coding, understand the context and commit to a clear aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick a pronounced one: brutally minimal, maximalist, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, and so on. Use these for inspiration, then design one true to the direction you chose.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What is the one thing someone will remember about it?

Choose the direction and execute it with precision. Bold maximalism and refined minimalism both work; the point is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:

- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point of view
- Refined in every detail

## Frontend Aesthetics Guidelines

- **Typography**: Choose fonts with character. Pair a distinctive display font with a refined body font. Avoid the defaults every generated interface uses, such as Inter, Roboto, Arial, and system font stacks, and do not settle on the same choice for every design.
- **Color & Theme**: Commit to a cohesive palette defined in CSS variables. Dominant colors with sharp accents outperform timid, evenly distributed palettes. Avoid the clichéd purple gradient on white.
- **Motion**: Spend motion on high-impact moments: one orchestrated page load with staggered reveals (`animation-delay`) delights more than scattered micro-interactions. Use CSS for motion; add an animation library only when the project already has one or the effect needs what CSS cannot do.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space or controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth instead of defaulting to solid colors: gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, or grain overlays, chosen to match the direction.

Match implementation complexity to the vision. Maximalist designs need elaborate code with layered effects; minimalist designs need restraint and precise spacing and typography.

## Execution

- Build the requested interface instead of stopping at ideas or mock descriptions.
- Make it work on desktop and mobile in the first pass, not as a follow-up.
- Keep accessibility basics: contrast, focus states, semantic elements, and reduced-motion support for animation.
