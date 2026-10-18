import type { SiteConfig } from "@codenhub/app-shell/site-config";

export const siteConfig: SiteConfig = {
  siteUrl: "https://codenhub.dev",
  title: "CodenHub",
  description:
    "The packages, apps, and standards behind coden.agency — one index, with links to docs, demos, and source.",
  githubUrl: "https://github.com/codenhub/codenhub",
  docsUrl: "https://docs.codenhub.dev",
  demoUrl: "https://demo.codenhub.dev",
  npmUrl: "https://www.npmjs.com/org/codenhub",
};

/**
 * What the shell header gets. Documentation and Demo stay off the header: the
 * index reaches them through its route cards and a package page through its
 * link buttons, which point at that package's docs and demo.
 */
export const headerConfig: SiteConfig = { ...siteConfig, docsUrl: undefined, demoUrl: undefined };
