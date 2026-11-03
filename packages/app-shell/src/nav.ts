import { defaultShellMessages, type ShellMessages } from "./messages.ts";
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
 * @param labels The Documentation and Demo labels; "CodenHub" is a name and is never translated.
 * @returns Ordered nav links: CodenHub, then Documentation, then Demo.
 */
export function resolveNavLinks(
  siteConfig: Pick<SiteConfig, "demoUrl" | "docsUrl" | "wwwUrl">,
  labels: ShellMessages["nav"] = defaultShellMessages.nav,
): ShellNavLink[] {
  return [
    { href: siteConfig.wwwUrl, label: "CodenHub" },
    { href: siteConfig.docsUrl, label: labels.documentation },
    { href: siteConfig.demoUrl, label: labels.demo },
  ].filter((link): link is ShellNavLink => link.href !== undefined);
}
