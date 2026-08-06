import { EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

interface ListedPackage {
  name: string;
  location: string;
  isPrivate: boolean;
  scripts: string[];
}

function describe(context: CommandContext): ListedPackage[] {
  return context.selection.targets.map(({ package: workspacePackage }) => ({
    isPrivate: workspacePackage.isPrivate,
    location: workspacePackage.location,
    name: workspacePackage.name,
    scripts: Object.keys(workspacePackage.scripts).sort(),
  }));
}

/**
 * Creates the command that reports which packages a selection resolves to.
 *
 * It doubles as the way to debug a selector before running anything expensive.
 * @returns Command definition ready for registration.
 */
export function createListCommand(): CommandDefinition {
  return {
    name: "list",
    run: async (context) => {
      const packages = describe(context);
      if (context.options.wantsJson) {
        context.reporter.info(JSON.stringify(packages, undefined, 2));
        return EXIT_SUCCESS;
      }

      const width = Math.max(1, ...packages.map(({ name }) => name.length));
      for (const listed of packages) {
        const visibility = listed.isPrivate ? "private" : "public";
        context.reporter.info(`  ${listed.name.padEnd(width)}  ${listed.location}`);
        context.reporter.detail(`  ${" ".repeat(width)}  ${visibility} · ${listed.scripts.join(", ")}`);
      }
      context.reporter.blank();
      context.reporter.detail(`  ${packages.length} package(s)`);
      return EXIT_SUCCESS;
    },
    summary: "List the packages a selection resolves to.",
    usage: "hub list [targets...] [--json]",
  };
}
