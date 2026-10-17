import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { UnsupportedFrontmatterError } from "../documentation/document-policy.ts";
import { buildLlmsFull, listLlmsFullSources } from "../documentation/llms-full.ts";
import { inspectPackageDocumentation } from "../documentation/package-documentation.ts";
import { parsePackageMetadata, usesLegacyMetadata, type PackageMetadata } from "../documentation/package-metadata.ts";
import { hasContentDrift } from "../generators/generator.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { isDocumentedPackage } from "../workspace/package-policy.ts";
import type { CheckRule, CheckRuleContext, Finding } from "./rule.ts";

const LLMS_FULL = "llms-full.txt";

function resolveSlug(workspacePackage: WorkspacePackage): {
  slug: string;
  finding?: Finding;
  metadata?: PackageMetadata | null;
} {
  try {
    const metadata = parsePackageMetadata(workspacePackage.manifest, `${workspacePackage.location}/package.json`);
    return { metadata, slug: metadata?.slug ?? workspacePackage.unscopedName };
  } catch (cause) {
    return {
      finding: {
        code: "documentation/invalid-metadata",
        location: "package.json",
        message: (cause as Error).message,
        severity: "error",
      },
      slug: workspacePackage.unscopedName,
    };
  }
}

/**
 * Maps every documentation slug in a workspace to the packages claiming it.
 *
 * Uniqueness cannot be seen from one package, so the map is built once from the
 * whole workspace rather than from the selected packages.
 * @param workspacePackages Every discovered package.
 * @returns Slugs mapped to the names of the packages that resolve to them.
 */
function collectSlugOwners(workspacePackages: readonly WorkspacePackage[]): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const workspacePackage of workspacePackages.filter(isDocumentedPackage)) {
    const { finding, slug } = resolveSlug(workspacePackage);
    if (finding === undefined) {
      owners.set(slug, [...(owners.get(slug) ?? []), workspacePackage.name]);
    }
  }
  return owners;
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (entry) => entry.isFile(),
    () => false,
  );
}

async function checkDocumentation(
  context: CheckRuleContext,
  slugOwners: ReadonlyMap<string, string[]>,
): Promise<Finding[]> {
  const workspacePackage = context.package;
  const { finding, metadata, slug } = resolveSlug(workspacePackage);
  if (finding !== undefined) {
    return [finding];
  }

  const conflicts = (slugOwners.get(slug) ?? []).filter((name) => name !== workspacePackage.name);
  const findings: Finding[] =
    conflicts.length === 0
      ? []
      : [
          {
            code: "documentation/duplicate-slug",
            location: "package.json",
            message: `Documentation slug "${slug}" is also claimed by ${conflicts.join(", ")}.`,
            severity: "error",
          },
        ];

  // The reader still accepts this shape for release tags cut before the
  // migration; only the working tree is held to the current one.
  if (usesLegacyMetadata(workspacePackage.manifest)) {
    findings.push({
      code: "documentation/legacy-metadata",
      location: "package.json",
      message:
        'Package metadata belongs on "codenhub", not inside "codenhub.docs"; move every field except "reference" up one level.',
      severity: "error",
    });
  }
  if (metadata?.logo !== undefined && !(await isFile(join(workspacePackage.directory, metadata.logo)))) {
    findings.push({
      code: "documentation/missing-logo",
      location: "package.json",
      message: `codenhub.logo references "${metadata.logo}", which is not a file in the package.`,
      severity: "error",
    });
  }

  const report = await inspectPackageDocumentation({
    includeNpmInventory: context.includePack,
    rootPath: workspacePackage.directory,
    slug,
    timeoutMs: context.timeoutMs,
  });
  return [
    ...findings,
    ...report.issues.map(
      (issue): Finding => ({
        code: `documentation/${issue.code}`,
        location: issue.sourcePath ?? issue.target,
        message:
          issue.target === undefined || issue.sourcePath === undefined
            ? issue.message
            : `${issue.message} (${issue.target})`,
        severity: "error",
      }),
    ),
  ];
}

async function checkLlmsFull(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  let generated: string;
  try {
    generated = await buildLlmsFull(workspacePackage.directory, await listLlmsFullSources(workspacePackage.directory));
  } catch (cause) {
    if (!(cause instanceof UnsupportedFrontmatterError)) {
      throw cause;
    }
    // The documentation rule reports the document whose frontmatter cannot be read, so no drift can be judged here.
    return [];
  }
  const authored = await readFile(join(workspacePackage.directory, LLMS_FULL), "utf8").catch(() => undefined);
  if (authored === undefined) {
    return [
      {
        code: "llms-full/missing",
        location: LLMS_FULL,
        message: `Missing ${LLMS_FULL}. Run \`pnpm generate\`.`,
        severity: "error",
      },
    ];
  }
  return hasContentDrift(generated, authored)
    ? [
        {
          code: "llms-full/drift",
          location: LLMS_FULL,
          message: `${LLMS_FULL} no longer matches its source documents. Run \`pnpm generate\`.`,
          severity: "error",
        },
      ]
    : [];
}

/**
 * Creates the rules that check package documentation against its specs.
 * @param workspacePackages Every discovered package, used to spot repeated documentation slugs.
 * @returns Documentation rules ready for registration.
 */
export function createDocumentationRules(workspacePackages: readonly WorkspacePackage[]): CheckRule[] {
  const slugOwners = collectSlugOwners(workspacePackages);
  return [
    {
      appliesTo: isDocumentedPackage,
      name: "documentation",
      run: (context) => checkDocumentation(context, slugOwners),
      summary: "Documentation surfaces, frontmatter, headings, links, and slug uniqueness.",
    },
    {
      appliesTo: isDocumentedPackage,
      name: "llms-full",
      run: ({ package: workspacePackage }) => checkLlmsFull(workspacePackage),
      summary: "Generated llms-full.txt matches the documents it compiles.",
    },
  ];
}
