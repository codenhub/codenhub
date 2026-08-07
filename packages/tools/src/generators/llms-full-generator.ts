import { buildLlmsFull, listLlmsFullSources } from "../documentation/llms-full.ts";
import { isDocumentedPackage } from "../workspace/package-policy.ts";
import type { Generator } from "./generator.ts";

/**
 * Creates the generator that compiles each package's `llms-full.txt`.
 *
 * `llms.txt` stays hand-authored: it is a router whose value is the editorial
 * summary a generator cannot write.
 * @returns Generator ready for registration.
 */
export function createLlmsFullGenerator(): Generator {
  return {
    generate: async ({ packages }) =>
      Promise.all(
        packages.filter(isDocumentedPackage).map(async (workspacePackage) => ({
          contents: await buildLlmsFull(
            workspacePackage.directory,
            await listLlmsFullSources(workspacePackage.directory),
          ),
          path: `${workspacePackage.location}/llms-full.txt`,
        })),
      ),
    name: "llms-full",
    summary: "Compile each package README and public docs into llms-full.txt.",
  };
}
