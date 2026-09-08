/**
 * Shape every CodenHub deploy surface fills in for the shared shell.
 *
 * `siteUrl` is the canonical origin of the surface itself and is what
 * `robots.txt` and `sitemap.xml` build their absolute URLs from. The remaining
 * URLs are the shell header's standard links; each renders only when it is set,
 * so a surface opts a link in or out purely by whether it carries the URL — it
 * omits the one that points back at itself, and sets the rest. `wwwUrl`,
 * `docsUrl`, and `demoUrl` are the left-side "Hub", "Documentation", and "Demo"
 * links; `npmUrl` is the npm mark beside GitHub on the right.
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
  /** Documentation site origin. Renders the header's "Documentation" link. */
  docsUrl?: string;
  /** Demo site origin. Renders the header's "Demo" link. */
  demoUrl?: string;
  /** Site index origin. Renders the header's "Hub" link. */
  wwwUrl?: string;
  /** npm organization page. Renders the header's npm mark. */
  npmUrl?: string;
}
