export interface SiteConfig {
  description: string;
  excludedPackageNames: ReadonlySet<string>;
  githubUrl: string;
  title: string;
}

export const siteConfig: SiteConfig = {
  title: "CodenHub",
  description: "Shared packages, apps, and project standards for and by coden.agency.",
  excludedPackageNames: new Set(["@codenhub/ui-kit"]),
  githubUrl: "https://github.com/codenhub/codenhub",
};
