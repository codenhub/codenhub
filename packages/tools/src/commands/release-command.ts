import { mapConcurrent } from "../process/concurrency.ts";
import { cutRelease } from "../release/cut.ts";
import { readPackageReadiness, type PackageReadiness, type ReadinessOptions } from "../release/readiness.ts";
import type { SummaryRow } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import type { CommandResolver } from "./verify-command.ts";

const SKIP_VERIFY_FLAG = "--skip-verify";
const CUT_FLAG = "--cut";

function toSummaryRow(readiness: PackageReadiness): SummaryRow {
  const blocked = readiness.checks.filter(({ status }) => status === "blocked").length;
  const unknown = readiness.checks.filter(({ status }) => status === "unknown").length;
  if (blocked > 0) {
    return {
      detail: `${blocked} blocker(s)`,
      label: readiness.workspacePackage.name,
      status: "failed",
    };
  }
  return unknown > 0
    ? { detail: `${unknown} unresolved`, label: readiness.workspacePackage.name, status: "warned" }
    : { detail: "ready to publish", label: readiness.workspacePackage.name, status: "passed" };
}

function report(context: CommandContext, results: readonly PackageReadiness[]): void {
  for (const readiness of results) {
    context.reporter.blank();
    context.reporter.step(readiness.workspacePackage.name);
    for (const check of readiness.checks) {
      const marker = check.status === "ready" ? "ok   " : check.status === "blocked" ? "block" : "?    ";
      context.reporter.info(`  ${marker}  ${check.name}`);
      context.reporter.detail(`         ${check.detail}`);
    }
  }
  context.reporter.blank();
  context.reporter.summarize(results.map(toSummaryRow));
}

/**
 * Creates the command that reports whether packages could be published.
 *
 * It writes nothing, tags nothing, and publishes nothing. Publishing is
 * irreversible in a way no other repository action is — a version can be
 * deprecated but never replaced — so the tooling stops at the report and leaves
 * the irreversible step to a person.
 *
 * The preconditions are the ones a build and a test run cannot answer: what the
 * registry already has, whether the tarball carries what the manifest promises,
 * and whether the source on disk is the source in a commit. Everything else is
 * `hub verify`, which this runs first unless `--skip-verify` says otherwise.
 * @param resolver Resolver for the verification step, defaulting to the command registry.
 * @param readiness Preflight overrides, injected by tests.
 * @returns Command definition ready for registration.
 */
function readCutFlag(passthrough: readonly string[]): string | undefined | { error: string } {
  if (passthrough.includes(CUT_FLAG)) {
    return { error: `${CUT_FLAG} takes its value with "=", as ${CUT_FLAG}=minor or ${CUT_FLAG}=0.4.0.` };
  }
  const found = passthrough.find((argument) => argument.startsWith(`${CUT_FLAG}=`));
  return found === undefined ? undefined : found.slice(CUT_FLAG.length + 1);
}

/**
 * Raises one package's version and scaffolds the changelog entry for it.
 *
 * It writes and stops there. Committing and tagging are left to a person
 * because the scaffolded page is deliberately unfinished: what changed for a
 * consumer is the one part of a release no tool can derive, and a cut that
 * committed itself would publish a changelog full of TODO bullets.
 * @param context Command context for this invocation.
 * @param requested A bump name, or an explicit version.
 * @returns Process exit code.
 */
async function runCut(context: CommandContext, requested: string): Promise<number> {
  const packages = context.selection.targets
    .map(({ package: workspacePackage }) => workspacePackage)
    .filter(({ isPrivate }) => !isPrivate);
  if (context.selection.isImplicit || packages.length !== 1) {
    context.reporter.error(`${CUT_FLAG} releases one package; name it, as "pnpm hub release error ${CUT_FLAG}=minor".`);
    return EXIT_FAILURE;
  }
  const [workspacePackage] = packages as [(typeof packages)[number]];

  let result;
  try {
    result = await cutRelease(workspacePackage, requested, new Date().toISOString().slice(0, 10));
  } catch (error) {
    context.reporter.error(error instanceof Error ? error.message : String(error));
    return EXIT_FAILURE;
  }

  context.reporter.step(`${workspacePackage.name} ${result.version}`);
  for (const path of result.written) {
    context.reporter.info(`  wrote  ${workspacePackage.location}/${path}`);
  }
  context.reporter.blank();
  context.reporter.info("Next, in this order:");
  context.reporter.detail(`  1. Fill in ${workspacePackage.location}/docs/changelog/${result.version}.md`);
  context.reporter.detail("  2. Run `pnpm generate` and commit both, then merge");
  context.reporter.detail(`  3. Tag the merge: git tag "${result.tag}" && git push origin "${result.tag}"`);
  return EXIT_SUCCESS;
}

export function createReleaseCommand(resolver?: CommandResolver, readiness: ReadinessOptions = {}): CommandDefinition {
  return {
    name: "release",
    run: async (context) => {
      const cut = readCutFlag(context.passthrough);
      if (typeof cut === "object" && cut !== undefined) {
        context.reporter.error(cut.error);
        return EXIT_FAILURE;
      }
      if (cut !== undefined) {
        return runCut(context, cut);
      }

      const publishable = context.selection.targets
        .map(({ package: workspacePackage }) => workspacePackage)
        .filter((workspacePackage) => !workspacePackage.isPrivate);

      if (publishable.length === 0) {
        context.reporter.warn("No selected package is published.");
        return EXIT_SUCCESS;
      }

      if (!context.passthrough.includes(SKIP_VERIFY_FLAG)) {
        const resolveCommand = resolver ?? (await import("./registry.ts")).resolveCommand;
        const exitCode = await resolveCommand("verify").run({ ...context, passthrough: [] });
        if (exitCode !== EXIT_SUCCESS) {
          context.reporter.blank();
          context.reporter.error("Verification failed; nothing is ready to publish.");
          return EXIT_FAILURE;
        }
      }

      const results = await mapConcurrent(publishable, context.options.concurrency, async (workspacePackage) =>
        readPackageReadiness(workspacePackage, { timeoutMs: context.options.timeoutMs, ...readiness }),
      );
      report(context, results);

      const blocked = results.some(({ checks }) => checks.some(({ status }) => status === "blocked"));
      return blocked ? EXIT_FAILURE : EXIT_SUCCESS;
    },
    summary: "Report whether the selected packages could be published.",
    usage: "hub release [targets...] [--cut=<version|major|minor|patch>] [--skip-verify]",
  };
}
