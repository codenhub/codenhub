import { parsePackageMetadata } from "../documentation/package-metadata.ts";
import { findUnmatchedDocsVersions } from "../release/docs-versions.ts";
import { parseReleaseTag } from "../release/publish.ts";
import { listTags } from "../release/published-tags.ts";
import type { CheckRule, Finding } from "./rule.ts";

/**
 * Lists every local tag once per run, however many packages ask.
 * @param root Repository root to list tags in.
 * @returns A memoized tag lister for {@link createDocsVersionRules}.
 */
export function createDocsVersionTagSource(root: string): () => Promise<readonly string[]> {
  let tags: Promise<readonly string[]> | undefined;
  return async () => {
    tags ??= listTags(root);
    return tags;
  };
}

/**
 * Builds the `docs-versions` rule: each `codenhub.docs.versions` entry matches a stable release.
 *
 * A malformed list is reported by the `documentation` rule, which parses the
 * metadata; this rule only reads a list that parses.
 * @param listTagsOnce Every local tag name.
 * @returns The rule.
 */
export function createDocsVersionRules(listTagsOnce: () => Promise<readonly string[]>): CheckRule[] {
  return [
    {
      appliesTo: ({ manifest }) => {
        const codenhub = manifest.codenhub;
        const docs =
          typeof codenhub === "object" && codenhub !== null ? (codenhub as { docs?: unknown }).docs : undefined;
        return typeof docs === "object" && docs !== null && "versions" in docs;
      },
      name: "docs-versions",
      run: async ({ package: workspacePackage }): Promise<Finding[]> => {
        let entries: string[];
        try {
          entries = parsePackageMetadata(workspacePackage.manifest, "package.json")?.docsVersions ?? [];
        } catch {
          return [];
        }
        if (entries.length === 0) {
          return [];
        }
        const versions = (await listTagsOnce()).flatMap((tag) => {
          const release = parseReleaseTag(tag);
          return release?.name === workspacePackage.name ? [release.version] : [];
        });
        return findUnmatchedDocsVersions(versions, entries).map((entry): Finding => ({
          code: "docs-versions/unmatched",
          location: "package.json",
          message: `codenhub.docs.versions entry "${entry}" matches no stable release tag, so it keeps nothing. If a matching version is released, run \`git fetch --tags\`.`,
          severity: "warning",
        }));
      },
      summary: "Each codenhub.docs.versions entry matches a stable release.",
    },
  ];
}
