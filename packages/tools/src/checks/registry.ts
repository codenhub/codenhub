import { createBrandSource } from "../assets/brand-source.ts";
import type { Workspace } from "../workspace/discover.ts";
import { createChangelogRules } from "./changelog-rules.ts";
import { createDependencyRules, createReleaseSources } from "./dependency-rules.ts";
import { createDocsVersionRules, createDocsVersionTagSource } from "./docs-version-rules.ts";
import { createDocumentationRules } from "./documentation-rules.ts";
import { createEnginesRules } from "./engines-rules.ts";
import { createExportsRules } from "./exports-rules.ts";
import { createManifestRules } from "./manifest-rules.ts";
import { createReadmeRules } from "./readme-rules.ts";
import { createReferenceRules } from "./reference-rules.ts";
import type { CheckRule } from "./rule.ts";
import { createSizeRuleSources, createSizeRules } from "./size-rules.ts";
import { createTranslationRules } from "./translation-rules.ts";
import { createUndocumentedExportRules } from "./undocumented-export-rules.ts";

/**
 * Builds every compliance rule for a workspace.
 *
 * Rules are created per run rather than declared as a constant because some of
 * them compare a package against the rest of the workspace, such as which
 * package names are internal and which documentation slugs are already taken.
 * @param workspace Discovered workspace.
 * @returns Rules in reporting order.
 */
export function createCheckRules(workspace: Workspace): CheckRule[] {
  const listTagsOnce = createDocsVersionTagSource(workspace.root);
  return [
    ...createManifestRules(createBrandSource()),
    ...createEnginesRules(workspace.root),
    ...createDependencyRules(workspace.packages, createReleaseSources(workspace.root)),
    ...createExportsRules(),
    ...createDocumentationRules(workspace.packages),
    ...createDocsVersionRules(listTagsOnce),
    ...createUndocumentedExportRules(),
    ...createReadmeRules(),
    ...createReferenceRules(),
    ...createChangelogRules(listTagsOnce),
    ...createTranslationRules(),
    ...createSizeRules(createSizeRuleSources(workspace.root)),
  ];
}
