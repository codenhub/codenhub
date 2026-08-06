import type { Workspace } from "../workspace/discover.ts";
import { createDocumentationRules } from "./documentation-rules.ts";
import { createManifestRules } from "./manifest-rules.ts";
import type { CheckRule } from "./rule.ts";

/**
 * Builds every compliance rule for a workspace.
 *
 * Rules are created per run rather than declared as a constant because manifest
 * rules need to know which package names belong to the workspace.
 * @param workspace Discovered workspace.
 * @returns Rules in reporting order.
 */
export function createCheckRules(workspace: Workspace): CheckRule[] {
  const workspaceNames = new Set(workspace.packages.map(({ name }) => name));
  return [...createManifestRules(workspaceNames), ...createDocumentationRules()];
}
