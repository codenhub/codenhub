// Workaround for codenhub/codenhub#451: an icon tag in a frontmatter string
// breaks the build, so data-driven icons come from per-icon modules instead.

/** A `virtual:@codenhub/icons/…` module, imported as a namespace. */
export interface IconModule {
  svg: string;
}

/**
 * Renders an icon module as a decorative inline icon, matching what the icons
 * plugin makes of a literal `<i aria-hidden="true" class="ic-…">` tag.
 *
 * Svg mode inlines only literal `<i>` tags, so an icon chosen from data, such
 * as one in a list of facts, is imported as its own module and rendered with
 * `set:html`. That module's `<svg>` already carries its icon class, which the
 * `@codenhub/icons` base rules size from `--ic-size`, but no `aria-hidden`.
 *
 * @param module - The icon module, as in `import * as tag from "virtual:@codenhub/icons/lucide/tag"`.
 * @returns The `<svg>` markup with `aria-hidden="true"`.
 */
export function decorative({ svg }: IconModule): string {
  return svg.replace(/^<svg\b/, '<svg aria-hidden="true"');
}
