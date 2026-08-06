import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { hasContentDrift } from "../documentation/llms-full.ts";
import type { GeneratedFile } from "../generators/generator.ts";
import type { SummaryRow } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

interface GeneratedOutcome {
  file: GeneratedFile;
  hasDrift: boolean;
}

async function generateFiles(context: CommandContext): Promise<GeneratedFile[]> {
  // The generators pull in a Markdown parser, which every other command can do without.
  const { createGenerators } = await import("../generators/registry.ts");
  const generatorContext = {
    isWholeWorkspace: context.selection.targets.length === context.workspace.packages.length,
    packages: context.selection.targets.map(({ package: workspacePackage }) => workspacePackage),
    workspace: context.workspace,
  };
  const results = await Promise.all(createGenerators().map(async (generator) => generator.generate(generatorContext)));
  return results.flat();
}

async function measureDrift(root: string, file: GeneratedFile): Promise<GeneratedOutcome> {
  const authored = await readFile(resolve(root, file.path), "utf8").catch(() => undefined);
  return { file, hasDrift: authored === undefined || hasContentDrift(file.contents, authored) };
}

/**
 * Creates the command that regenerates derived repository files.
 *
 * Files are only written when their content actually changes, so a clean run
 * leaves the working tree untouched.
 * @returns Command definition ready for registration.
 */
export function createGenerateCommand(): CommandDefinition {
  return {
    name: "generate",
    run: async (context) => {
      const root = context.workspace.root;
      const files = await generateFiles(context);
      const outcomes = await Promise.all(files.map(async (file) => measureDrift(root, file)));
      const stale = outcomes.filter(({ hasDrift }) => hasDrift);

      if (context.options.isDryRun) {
        context.reporter.step(`${stale.length} of ${outcomes.length} generated file(s) are out of date`);
        for (const { file } of stale) {
          context.reporter.detail(`  ${file.path}`);
        }
        return stale.length > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
      }

      await Promise.all(stale.map(async ({ file }) => writeFile(resolve(root, file.path), file.contents, "utf8")));

      const rows = outcomes.map<SummaryRow>(({ file, hasDrift }) => ({
        detail: hasDrift ? "written" : "unchanged",
        label: file.path,
        status: hasDrift ? "passed" : "skipped",
      }));
      context.reporter.summarize(rows);
      context.reporter.blank();
      context.reporter.detail(`  ${stale.length} of ${outcomes.length} file(s) written`);
      return EXIT_SUCCESS;
    },
    summary: "Regenerate derived files such as llms-full.txt and the README package list.",
    usage: "hub generate [targets...] [--dry-run]",
  };
}
