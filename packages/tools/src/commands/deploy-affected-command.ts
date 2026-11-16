import { findAffectedSites } from "../deploy/affected-sites.ts";
import { execute } from "../process/execute.ts";
import { findChangedPaths } from "../workspace/changed-packages.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandDefinition } from "./definition.ts";

/** What the command reads from git, replaceable in tests. */
export interface DeployAffectedDependencies {
  /** Lists repository-relative paths changed since `ref`. */
  findChangedPaths(root: string, ref: string): Promise<string[]>;
  /** Whether `ref` names a commit in the repository at `root`. */
  refExists(root: string, ref: string): Promise<boolean>;
}

async function refExists(root: string, ref: string): Promise<boolean> {
  const outcome = await execute(
    { args: ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], command: "git", cwd: root },
    { stdio: "pipe" },
  );
  return outcome.isSuccess;
}

const DEFAULT_DEPENDENCIES: DeployAffectedDependencies = { findChangedPaths, refExists };

/**
 * Creates the command that names the deployed sites a range of commits can change.
 *
 * `.github/workflows/deploy.yml` runs it on each push to `main` with the commit the push
 * started from, and triggers a build for each site it prints.
 * @param dependencies Git access, replaced in tests.
 * @returns Command definition ready for registration.
 */
export function createDeployAffectedCommand(
  dependencies: DeployAffectedDependencies = DEFAULT_DEPENDENCIES,
): CommandDefinition {
  return {
    name: "deploy:affected",
    run: async (context) => {
      const { root } = context.workspace;
      const { baseRef, useChangedFilter, wantsJson } = context.options;
      if (!useChangedFilter) {
        context.reporter.error("deploy:affected needs --changed=<ref>, the commit to compare with.");
        return EXIT_FAILURE;
      }
      // `findChangedPaths` reads an unknown ref as no committed change, which would print no
      // site and read as nothing to deploy.
      if (!(await dependencies.refExists(root, baseRef))) {
        context.reporter.error(`${baseRef} does not name a commit here; fetch it before comparing.`);
        return EXIT_FAILURE;
      }
      const sites = findAffectedSites(context.workspace, await dependencies.findChangedPaths(root, baseRef));
      if (wantsJson) {
        context.reporter.info(JSON.stringify(sites));
        return EXIT_SUCCESS;
      }
      for (const site of sites) {
        context.reporter.info(site);
      }
      return EXIT_SUCCESS;
    },
    selectsPackages: false,
    summary: "Name the deployed sites changed since a commit.",
    usage: "hub deploy:affected --changed=<ref> [--json]",
  };
}
