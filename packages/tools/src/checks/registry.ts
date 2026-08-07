import type { Workspace } from "../workspace/discover.ts";
import { createDependencyRules } from "./dependency-rules.ts";
import { createDocumentationRules } from "./documentation-rules.ts";
import { createExportsRules } from "./exports-rules.ts";
import { createManifestRules } from "./manifest-rules.ts";
import { createReadmeRules } from "./readme-rules.ts";
import type { CheckRule } from "./rule.ts";

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
  return [
    ...createManifestRules(),
    ...createDependencyRules(workspace.packages),
    ...createExportsRules(),
    ...createDocumentationRules(workspace.packages),
    ...createReadmeRules(),
  ];
}
