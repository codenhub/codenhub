/**
 * Shape every CodenHub deploy surface fills in for the shared shell.
 *
 * `siteUrl` is the canonical origin of the surface itself and is what
 * `robots.txt` and `sitemap.xml` build their absolute URLs from. The remaining
 * URLs are cross-links the shell chrome renders; a surface omits the one that
 * points back at itself.
 */
export interface SiteConfig {
  /** Canonical origin of this surface, without a trailing slash. */
  siteUrl: string;
  /** Display name shown in the header and used to compose the document title. */
  title: string;
  /** Default meta description, used when a page sets none. */
  description: string;
  /** Repository URL for the header's source link. */
  githubUrl: string;
  /** Documentation site origin, when this surface links out to it. */
  docsUrl?: string;
  /** Demo site origin, when this surface links out to it. */
  demoUrl?: string;
  /** Site index origin, when this surface links out to it. */
  wwwUrl?: string;
  /** npm organization page, when this surface links out to it. */
  npmUrl?: string;
}
