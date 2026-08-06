import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildLlmsFull, hasContentDrift } from "../documentation/llms-full.ts";
import { inspectPackageDocumentation } from "../documentation/package-documentation.ts";
import { parsePackageMetadata } from "../documentation/package-metadata.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { isDocumentedPackage, type CheckRule, type Finding } from "./rule.ts";

const LLMS_FULL = "llms-full.txt";

function resolveSlug(workspacePackage: WorkspacePackage): { slug: string; finding?: Finding } {
  try {
    const metadata = parsePackageMetadata(workspacePackage.manifest, `${workspacePackage.location}/package.json`);
    return { slug: metadata?.slug ?? workspacePackage.unscopedName };
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

async function checkDocumentation(workspacePackage: WorkspacePackage, includePack: boolean): Promise<Finding[]> {
  const { finding, slug } = resolveSlug(workspacePackage);
  if (finding !== undefined) {
    return [finding];
  }

  const report = await inspectPackageDocumentation({
    includeNpmInventory: includePack,
    rootPath: workspacePackage.directory,
    slug,
  });
  return report.issues.map((issue) => ({
    code: `documentation/${issue.code}`,
    location: issue.sourcePath ?? issue.target,
    message:
      issue.target === undefined || issue.sourcePath === undefined
        ? issue.message
        : `${issue.message} (${issue.target})`,
    severity: "error",
  }));
}

/**
 * Lists the documents an `llms-full.txt` compilation is generated from.
 * @param rootPath Absolute package directory.
 * @returns Package-relative POSIX paths, including `README.md` when it exists.
 */
export async function listLlmsFullSources(rootPath: string): Promise<string[]> {
  const [documents, hasReadme] = await Promise.all([
    Array.fromAsync(glob("docs/**/*.md", { cwd: rootPath })),
    readFile(join(rootPath, "README.md"), "utf8").then(
      () => true,
      () => false,
    ),
  ]);
  const paths = documents.map((path) => path.replaceAll("\\", "/"));
  return hasReadme ? ["README.md", ...paths] : paths;
}

async function checkLlmsFull(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  const generated = await buildLlmsFull(
    workspacePackage.directory,
    await listLlmsFullSources(workspacePackage.directory),
  );
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
 * @returns Documentation rules ready for registration.
 */
export function createDocumentationRules(): CheckRule[] {
  return [
    {
      appliesTo: isDocumentedPackage,
      name: "documentation",
      run: ({ includePack, package: workspacePackage }) => checkDocumentation(workspacePackage, includePack),
      summary: "Documentation surfaces, frontmatter, headings, and links resolve.",
    },
    {
      appliesTo: isDocumentedPackage,
      name: "llms-full",
      run: ({ package: workspacePackage }) => checkLlmsFull(workspacePackage),
      summary: "Generated llms-full.txt matches the documents it compiles.",
    },
  ];
}
