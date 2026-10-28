import type { PackageStatus } from "@codenhub/tools/documentation";

/** What the site-wide `llms.txt` shows of one package. */
export interface LlmsIndexPackage {
  description?: string;
  label: string;
  /** npm package name, preferred over {@link label} as the link text. */
  name?: string;
  slug: string;
  status: PackageStatus;
}

/**
 * Builds the site-wide `llms.txt`: an index of every package's own `llms.txt`,
 * with each `llms-full.txt` in the skippable `Optional` section.
 * @param site Site origin, title, and summary.
 * @param packages Documented packages in catalog order.
 * @returns `llms.txt` contents in the llmstxt.org format.
 */
export function buildSiteLlmsTxt(
  site: { description: string; siteUrl: string; title: string },
  packages: readonly LlmsIndexPackage[],
): string {
  const fileUrl = (entry: LlmsIndexPackage, file: string): string =>
    new URL(`/${entry.slug}/${file}`, site.siteUrl).href;
  const packageLines = packages.map((entry) => {
    const notes = [entry.description, entry.status === "active" ? undefined : `Status: ${entry.status}.`]
      .filter((note) => note !== undefined && note !== "")
      .join(" ");
    const link = `- [${entry.name ?? entry.label}](${fileUrl(entry, "llms.txt")})`;
    return notes === "" ? link : `${link}: ${notes}`;
  });
  const fullLines = packages.map(
    (entry) =>
      `- [${entry.name ?? entry.label} full documentation](${fileUrl(entry, "llms-full.txt")}): ` +
      "The README and every public document in one file.",
  );
  return [
    `# ${site.title}`,
    "",
    `> ${site.description}`,
    "",
    "Each package publishes an `llms.txt` that routes to its documentation and an `llms-full.txt` that compiles its README and public documentation into one file. Links in both are absolute.",
    "",
    "## Packages",
    "",
    ...packageLines,
    "",
    "## Optional",
    "",
    ...fullLines,
    "",
  ].join("\n");
}
