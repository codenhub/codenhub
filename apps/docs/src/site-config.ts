export interface HeaderLink {
  href: string;
  label: string;
}

export interface SiteConfig {
  description: string;
  headerLinks: HeaderLink[];
  title: string;
}

export const siteConfig: SiteConfig = {
  title: "Codenhub Docs",
  description: "Reference and guides for Codenhub packages.",
  headerLinks: [{ href: "https://github.com/codenhub/codenhub", label: "GitHub" }],
};
