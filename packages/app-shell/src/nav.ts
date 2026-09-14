import type { SiteConfig } from "./site-config.ts";

/** One header nav link: label text plus the URL it opens. */
export interface ShellNavLink {
  href: string;
  label: string;
}

/**
 * Resolves the shell header's standard cross-surface nav links from a
 * `SiteConfig`. A link is included only when its URL is set, so a surface (or
 * a package demo reusing the same shape) opts a link in or out purely by
 * whether it carries that URL — there is no separate flag. Every link points
 * at another origin, so a caller renders each with an outbound-link
 * affordance and `target="_blank"`.
 * @param siteConfig The URLs to resolve links from.
 * @returns Ordered nav links: Hub, then Documentation, then Demo.
 */
export function resolveNavLinks(siteConfig: Pick<SiteConfig, "demoUrl" | "docsUrl" | "wwwUrl">): ShellNavLink[] {
  return [
    { href: siteConfig.wwwUrl, label: "Hub" },
    { href: siteConfig.docsUrl, label: "Documentation" },
    { href: siteConfig.demoUrl, label: "Demo" },
  ].filter((link): link is ShellNavLink => link.href !== undefined);
}
