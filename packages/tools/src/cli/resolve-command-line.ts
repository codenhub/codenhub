import { listCommands } from "../commands/registry.ts";
import type { Workspace } from "../workspace/discover.ts";
import { createAliasIndex, lookupPackage } from "../workspace/package-aliases.ts";
import type { ParsedArguments } from "./parse-arguments.ts";

/**
 * Accepts a package selector before its script when that order is unambiguous.
 * @param parsed Command-first interpretation produced by the argument parser.
 * @param workspace Discovered packages used to identify the leading selector.
 * @returns Invocation normalized to the command-first form used internally.
 */
export function resolveCommandLine(parsed: ParsedArguments, workspace: Workspace): ParsedArguments {
  const script = parsed.tokens[0];
  if (script === undefined || listCommands().some(({ name }) => name === parsed.commandName)) {
    return parsed;
  }

  const lookup = lookupPackage(createAliasIndex(workspace.packages), parsed.commandName);
  if (lookup.kind !== "match" || lookup.package.scripts[script] === undefined) {
    return parsed;
  }

  return {
    ...parsed,
    commandName: script,
    tokens: [parsed.commandName, ...parsed.tokens.slice(1)],
  };
}
