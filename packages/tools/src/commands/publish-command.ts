import { mapSeries } from "../process/concurrency.ts";
import {
  distTagForVersion,
  readPublishedVersion,
  resolveTagTarget,
  runNpmPublish,
  type PublishRunner,
  type RegistryReader,
} from "../release/publish.ts";
import { readPackageReadiness, type PackageReadiness, type ReadinessOptions } from "../release/readiness.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import type { CommandResolver } from "./verify-command.ts";

const SKIP_VERIFY_FLAG = "--skip-verify";
const FROM_TAG_FLAG = "--from-tag";

/** How the publish command should reach the outside world. Injected by tests. */
export interface PublishOptions {
  /** Preflight overrides passed through to the readiness report. */
  readiness?: ReadinessOptions;
  /** Runner for `npm publish`, defaulting to real child processes. */
  publish?: PublishRunner;
  /** Reader for the post-publish registry confirmation, defaulting to `npm view`. */
  readPublished?: RegistryReader;
}

function readTagFlag(passthrough: readonly string[]): string | undefined | { error: string } {
  if (passthrough.includes(FROM_TAG_FLAG)) {
    return { error: `${FROM_TAG_FLAG} takes its value with "=", as ${FROM_TAG_FLAG}=@codenhub/error@0.3.0.` };
  }
  const found = passthrough.find((argument) => argument.startsWith(`${FROM_TAG_FLAG}=`));
  return found === undefined ? undefined : found.slice(FROM_TAG_FLAG.length + 1);
}

/**
 * Resolves what a run should publish, or why it should publish nothing.
 *
 * A tag names exactly one package. Without one, the packages come from the
 * selectors, and an implicit selection is refused: `pnpm hub publish` with no
 * target would otherwise mean "publish the whole workspace", which is the one
 * irreversible thing nobody types by accident on purpose.
 * @param context Command context for this invocation.
 * @returns Packages to publish, or the message explaining why there are none.
 */
function resolveTargets(context: CommandContext): { packages: WorkspacePackage[] } | { error: string } {
  const tag = readTagFlag(context.passthrough);
  if (typeof tag === "object" && tag !== undefined) {
    return tag;
  }
  if (tag !== undefined) {
    const resolved = resolveTagTarget(tag, context.workspace.packages);
    return "package" in resolved ? { packages: [resolved.package] } : { error: resolved.detail };
  }
  if (context.selection.isImplicit) {
    return { error: `Name the package to publish, as "pnpm hub publish error".` };
  }
  const packages = context.selection.targets
    .map(({ package: workspacePackage }) => workspacePackage)
    .filter(({ isPrivate }) => !isPrivate);
  return packages.length === 0 ? { error: "No selected package is published." } : { packages };
}

function reportPreflight(context: CommandContext, readiness: PackageReadiness): boolean {
  context.reporter.step(`${readiness.workspacePackage.name} preflight`);
  let isReady = true;
  for (const check of readiness.checks) {
    // `unknown` blocks here even though `hub release` only warns on it. A report
    // may leave a question open for a person to answer; a publish cannot, because
    // by the time anyone reads the answer the version is on the registry for good.
    if (check.status !== "ready") {
      isReady = false;
    }
    context.reporter.info(`  ${check.status === "ready" ? "ok   " : "block"}  ${check.name}`);
    context.reporter.detail(`         ${check.detail}`);
  }
  return isReady;
}

/**
 * Creates the command that publishes packages to npm.
 *
 * This is the one command in the repository that does something irreversible, so
 * it is deliberately hard to invoke by accident: it publishes what a release tag
 * names, or what an explicit selector names, and refuses an implicit selection
 * outright. `docs/specs/packages-lifecycle.md` owns the rule it implements —
 * a person authorizes a release by pushing its tag, and CI performs it.
 *
 * Authentication is never configured here. In the workflow it comes from npm
 * trusted publishing, which exchanges the job's OIDC token for a short-lived
 * credential; on a maintainer's machine it comes from their own `npm login`.
 * Either way no token exists in this repository.
 * @param resolver Resolver for the verification step, defaulting to the command registry.
 * @param options Runners injected by tests.
 * @returns Command definition ready for registration.
 */
export function createPublishCommand(resolver?: CommandResolver, options: PublishOptions = {}): CommandDefinition {
  return {
    name: "publish",
    run: async (context) => {
      const resolved = resolveTargets(context);
      if ("error" in resolved) {
        context.reporter.error(resolved.error);
        return EXIT_FAILURE;
      }
      const { packages } = resolved;
      const selection = {
        ...context.selection,
        isImplicit: false,
        targets: packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      };

      if (!context.passthrough.includes(SKIP_VERIFY_FLAG)) {
        const resolveCommand = resolver ?? (await import("./registry.ts")).resolveCommand;
        const exitCode = await resolveCommand("verify").run({ ...context, passthrough: [], selection });
        if (exitCode !== EXIT_SUCCESS) {
          context.reporter.blank();
          context.reporter.error("Verification failed; nothing was published.");
          return EXIT_FAILURE;
        }
      }

      // Sequential rather than concurrent, and it stops at the first failure: a
      // half-finished concurrent publish leaves a set of packages nobody can
      // describe, and a release names one package anyway.
      let hasFailed = false;
      await mapSeries(packages, async (workspacePackage) => {
        if (hasFailed) {
          return;
        }
        context.reporter.blank();
        const readiness = await readPackageReadiness(workspacePackage, {
          timeoutMs: context.options.timeoutMs,
          ...options.readiness,
        });
        if (!reportPreflight(context, readiness)) {
          context.reporter.blank();
          context.reporter.error(`${workspacePackage.name} is not ready to publish; nothing was published.`);
          hasFailed = true;
          return;
        }
        const distTag = distTagForVersion(String(workspacePackage.manifest.version));
        const distTagArgs = distTag === undefined ? "" : ` --tag ${distTag}`;
        if (context.options.isDryRun) {
          context.reporter.info(
            `  would run: npm publish --access public${distTagArgs} (in ${workspacePackage.location})`,
          );
          return;
        }
        const outcome = await (options.publish ?? runNpmPublish)(workspacePackage, context.options.timeoutMs);
        if (!outcome.isSuccess) {
          context.reporter.error(`npm publish failed for ${workspacePackage.name}.`);
          context.reporter.detail(outcome.output);
          hasFailed = true;
          return;
        }
        const version = String(workspacePackage.manifest.version);
        context.reporter.info(
          `  published ${workspacePackage.name}@${version}${distTag === undefined ? "" : ` under dist-tag ${distTag}`}`,
        );

        // A report, never a gate. Registry metadata propagates eventually, so a
        // version that has not appeared yet means "look again in a moment"; the
        // tarball is already on npm either way and failing here would only
        // describe a successful publish as a failed one.
        const served = await (options.readPublished ?? readPublishedVersion)(
          workspacePackage,
          context.options.timeoutMs,
        );
        context.reporter.detail(
          served === version
            ? `         the registry serves ${version}`
            : `         the registry serves ${served ?? "nothing yet"}; metadata may still be propagating`,
        );
      });

      return hasFailed ? EXIT_FAILURE : EXIT_SUCCESS;
    },
    summary: "Publish the selected packages to npm.",
    usage: "hub publish [targets...] [--from-tag=<tag>] [--dry-run] [--skip-verify]",
  };
}
