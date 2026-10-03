import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { mapConcurrent } from "../process/concurrency.ts";
import { execute, formatCommand, type CommandSpec } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

/** Repository-relative file holding the labels that are not derived from the workspace. */
export const LABELS_FILE = ".github/labels.json";

const PACKAGE_LABEL_COLOR = "c5def5";
const APP_LABEL_COLOR = "bfd4f2";
// A few requests at a time stays well inside GitHub's secondary rate limit.
const LABEL_CONCURRENCY = 4;
const LABEL_FIELDS = ["name", "color", "description"] as const;

/** A GitHub issue label. */
export interface Label {
  /** Label name, such as `type:bug`. */
  name: string;
  /** Hex color without the leading `#`. */
  color: string;
  /** One-line description shown next to the label. */
  description: string;
}

/**
 * Parses the hand-written label list.
 * @param source Contents of {@link LABELS_FILE}.
 * @returns Labels in file order.
 */
export function parseLabels(source: string): Label[] {
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${LABELS_FILE} must be an array of labels.`);
  }
  return parsed.map((entry: unknown, index) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    for (const field of LABEL_FIELDS) {
      if (typeof record[field] !== "string" || record[field] === "") {
        throw new TypeError(`${LABELS_FILE} entry ${index} needs a non-empty string "${field}".`);
      }
    }
    return { color: record.color as string, description: record.description as string, name: record.name as string };
  });
}

/**
 * Derives one label per workspace package and app.
 *
 * A package nested inside another one, such as `packages/icons/demo`, is part of
 * its parent's surface and gets no label of its own.
 * @param packages Discovered workspace packages.
 * @returns `pkg:<name>` and `app:<directory>` labels ordered by location.
 */
export function deriveWorkspaceLabels(packages: readonly WorkspacePackage[]): Label[] {
  const locations = packages.map(({ location }) => location);
  return packages.flatMap(({ directoryName, location, name, unscopedName }): Label[] => {
    if (locations.some((other) => other !== location && location.startsWith(`${other}/`))) {
      return [];
    }
    if (location.startsWith("apps/")) {
      return [{ color: APP_LABEL_COLOR, description: `The ${location} app`, name: `app:${directoryName}` }];
    }
    return [{ color: PACKAGE_LABEL_COLOR, description: name, name: `pkg:${unscopedName}` }];
  });
}

function buildCreateSpec(label: Label, cwd: string): CommandSpec {
  return {
    args: ["label", "create", label.name, "--color", label.color, "--description", label.description, "--force"],
    command: "gh",
    cwd,
  };
}

async function listRemoteLabels(cwd: string): Promise<string[] | undefined> {
  const outcome = await execute(
    { args: ["label", "list", "--limit", "1000", "--json", "name", "--jq", ".[].name"], command: "gh", cwd },
    { stdio: "pipe" },
  );
  if (!outcome.isSuccess) {
    return undefined;
  }
  return (outcome.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

async function runLabelsCommand(context: CommandContext): Promise<number> {
  const { reporter, workspace } = context;
  const labels = [
    ...parseLabels(await readFile(join(workspace.root, LABELS_FILE), "utf8")),
    ...deriveWorkspaceLabels(workspace.packages),
  ];
  const specs = labels.map((label) => buildCreateSpec(label, workspace.root));

  if (context.options.isDryRun) {
    reporter.step(`Would create or update ${specs.length} label(s)`);
    for (const spec of specs) {
      reporter.detail(`  ${formatCommand(spec)}`);
    }
    return EXIT_SUCCESS;
  }

  const remote = await listRemoteLabels(workspace.root);
  if (remote === undefined) {
    reporter.error("Could not list the repository's labels. Is `gh` installed and authenticated?");
    return EXIT_FAILURE;
  }

  reporter.step(`Syncing ${specs.length} label(s)`);
  // `--force` updates an existing label in place, so a run is safe to repeat.
  const outcomes = await mapConcurrent(specs, LABEL_CONCURRENCY, async (spec) => execute(spec, { stdio: "pipe" }));
  let failures = 0;
  for (const [index, outcome] of outcomes.entries()) {
    if (!outcome.isSuccess) {
      failures += 1;
      reporter.error(`${labels[index]?.name}: ${(outcome.output ?? "").trim()}`);
    }
  }

  // Deleting a label strips it from every issue carrying it, so labels missing
  // from the list are reported for a maintainer to remove rather than removed.
  const known = new Set(labels.map(({ name }) => name));
  const extras = remote.filter((name) => !known.has(name));
  if (extras.length > 0) {
    reporter.blank();
    reporter.warn(`${extras.length} label(s) on GitHub are not in the list: ${extras.join(", ")}`);
    reporter.detail("  Delete them with `gh label delete <name>` once nothing needs them.");
  }

  return failures > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
}

/**
 * Creates the command that syncs the repository's GitHub labels.
 *
 * The list is {@link LABELS_FILE} plus one label per workspace package and app,
 * derived on every run so a new package never waits on someone remembering to
 * add its label.
 * @returns Command definition ready for registration.
 */
export function createLabelsCommand(): CommandDefinition {
  return {
    name: "labels",
    run: runLabelsCommand,
    selectsPackages: false,
    summary: "Create or update the repository's GitHub labels.",
    usage: "hub labels [--dry-run]",
  };
}
