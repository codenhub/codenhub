import type { WorkspacePackage } from "./discover.ts";

/**
 * Reports whether a package declares public documentation metadata.
 * @param workspacePackage Package to inspect.
 * @returns `true` when the manifest has a `codenhub.docs` object.
 */
export function hasDocumentationMetadata(workspacePackage: WorkspacePackage): boolean {
  const codenhub = workspacePackage.manifest.codenhub;
  return typeof codenhub === "object" && codenhub !== null && "docs" in codenhub;
}

/**
 * Reports whether a package must comply with the public package specs.
 *
 * Publication and documentation eligibility are separate concerns, so a private
 * package opts in by declaring the same metadata a published one must declare.
 * @param workspacePackage Package to inspect.
 * @returns `true` for published packages and private packages that opt in.
 */
export function isDocumentedPackage(workspacePackage: WorkspacePackage): boolean {
  return !workspacePackage.isPrivate || hasDocumentationMetadata(workspacePackage);
}
