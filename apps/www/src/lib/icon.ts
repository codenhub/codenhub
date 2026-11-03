// Workaround for codenhub/codenhub#451: an icon tag in a frontmatter string
// breaks the build, so data-driven icons come from per-icon modules instead.
// Workaround for codenhub/codenhub#452: those modules render with no icon class
// and no `aria-hidden`, which `decorative` adds back.

/** A `virtual:@codenhub/icons/…` module, imported as a namespace. */
export interface IconModule {
  icon: { prefix: string; iconName: string };
  svg: string;
}

/**
 * Renders an icon module as a decorative inline icon, matching what the icons
 * plugin makes of a literal `<i aria-hidden="true" class="ic-…">` tag.
 *
 * Svg mode inlines only literal `<i>` tags, so an icon chosen from data, such
 * as one in a list of facts, is imported as its own module and rendered with
 * `set:html`. That module's `<svg>` carries neither `aria-hidden` nor the icon
 * class, and the class is what the `@codenhub/icons` base rules size from
 * `--ic-size`.
 *
 * @param module - The icon module, as in `import * as tag from "virtual:@codenhub/icons/lucide/tag"`.
 * @returns The `<svg>` markup with `aria-hidden="true"` and its `ic-<family>-<name>` class.
 */
export function decorative({ icon, svg }: IconModule): string {
  return svg.replace(/^<svg\b/, `<svg aria-hidden="true" class="ic-${icon.prefix}-${icon.iconName}"`);
}
