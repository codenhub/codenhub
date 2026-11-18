import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createDocumentGraph, isValidationSurface } from "../documentation/document-graph.ts";
import { listPackageFiles } from "../documentation/package-documentation.ts";
import { parsePackageMetadata } from "../documentation/package-metadata.ts";
import {
  describeStaleTranslation,
  findMissingTranslations,
  findStaleTranslations,
  hashBlobs,
  listSourcedTranslations,
  listTranslations,
  validateTranslations,
  type BlobHasher,
} from "../documentation/translations.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { isDocumentedPackage } from "../workspace/package-policy.ts";
import type { CheckRule, Finding } from "./rule.ts";

function isActive(workspacePackage: WorkspacePackage): boolean {
  try {
    return (
      parsePackageMetadata(workspacePackage.manifest, `${workspacePackage.location}/package.json`)?.status === "active"
    );
  } catch {
    // A malformed manifest is already reported by the documentation rule.
    return false;
  }
}

/**
 * Reports what an `active` package has not translated. Whether people use an
 * experimental package is a judgment, so only `active` is checked for certain,
 * as "Leaving experimental" in `docs/specs/packages-lifecycle.md` asks.
 */
function checkCompleteness(workspacePackage: WorkspacePackage, files: readonly string[]): Finding[] {
  if (!isActive(workspacePackage)) {
    return [];
  }
  return findMissingTranslations(files).map((missing): Finding => ({
    code: "translation/missing",
    location: missing.englishPath,
    message: `No ${missing.locale} translation at ${missing.packagePath}; an active package translates its README and every public document into every listed locale.`,
    severity: "error",
  }));
}

async function run(workspacePackage: WorkspacePackage, hash: BlobHasher): Promise<Finding[]> {
  const files = await listPackageFiles(workspacePackage.directory);
  const missing = checkCompleteness(workspacePackage, files);
  if (listTranslations(files).length === 0) {
    return missing;
  }
  const sources = Object.fromEntries(
    await Promise.all(
      files
        .filter((packagePath) => isValidationSurface(packagePath))
        .map(async (packagePath) => [
          packagePath,
          await readFile(join(workspacePackage.directory, packagePath), "utf8"),
        ]),
    ),
  );
  const graph = createDocumentGraph(
    Object.fromEntries(files.map((packagePath) => [packagePath, sources[packagePath] ?? ""])),
  );
  const stale = await findStaleTranslations(
    workspacePackage.directory,
    listSourcedTranslations(graph.files, sources),
    hash,
  );
  const issues = validateTranslations(graph, sources, new Set(stale.map(({ packagePath }) => packagePath)));
  return [
    ...missing,
    ...issues.map((issue): Finding => ({
      code: `translation/${issue.code}`,
      location: issue.sourcePath,
      message: issue.target === undefined ? issue.message : `${issue.message} (${issue.target})`,
      severity: issue.severity,
    })),
    ...stale.map((translation): Finding => ({
      code: "translation/stale",
      location: translation.packagePath,
      message: `${describeStaleTranslation(translation)} hub release and hub publish refuse a stale translation.`,
      severity: "warning",
    })),
  ];
}

/**
 * Creates the rule that checks package translations against
 * `docs/specs/packages-translations.md`.
 *
 * A stale translation is only a warning here: a change to an English page may
 * merge before its translation follows. `hub release` and `hub publish` are
 * where staleness stops, because a release is where a translation reaches readers.
 * @param hash Blob hasher, defaulting to `git hash-object`. Injected by tests.
 * @returns Rules ready for registration.
 */
export function createTranslationRules(hash: BlobHasher = hashBlobs): CheckRule[] {
  return [
    {
      appliesTo: isDocumentedPackage,
      name: "translation",
      run: ({ package: workspacePackage }) => run(workspacePackage, hash),
      summary:
        "Translations mirror an English file in a listed locale, record a current source, and keep its shape; an active package translates everything.",
    },
  ];
}
