export interface SiteConfig {
  baseUrl: string;
  description: string;
  docsUrl: string;
  githubUrl: string;
  title: string;
}

export const siteConfig: SiteConfig = {
  baseUrl: "https://demo.codenhub.dev",
  description: "Live, deployed demos for every CodenHub package that ships one.",
  docsUrl: "https://docs.codenhub.dev",
  githubUrl: "https://github.com/codenhub/codenhub",
  title: "CodenHub Demos",
};
