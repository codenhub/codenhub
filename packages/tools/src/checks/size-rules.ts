import { access } from "node:fs/promises";
import { join } from "node:path";

import { releaseTagFor } from "../release/publish.ts";
import { listTags } from "../release/published-tags.ts";
import type { ReadinessCheck } from "../release/readiness.ts";
import { SIZE_FILE } from "../release/size-report.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { CheckRule, Finding } from "./rule.ts";

/** What the `size` rule reads outside the package, injectable for tests. */
export interface SizeRuleSources {
  /** Every local tag name. */
  listTags: () => Promise<readonly string[]>;
  /** The `size` publish precondition: re-measures the package and compares it with `size.json`. */
  checkSize: (workspacePackage: WorkspacePackage, timeoutMs?: number) => Promise<ReadinessCheck>;
}

/**
 * Real sources for a workspace: `git tag --list` once per run, and the publish
 * precondition loaded on first use, since it pulls in the bundler.
 * @param root Repository root to list tags in.
 * @returns Sources for {@link createSizeRules}.
 */
export function createSizeRuleSources(root: string): SizeRuleSources {
  let tags: Promise<readonly string[]> | undefined;
  return {
    checkSize: async (workspacePackage, timeoutMs) =>
      (await import("../release/bundle-size.ts")).checkBundleSize(workspacePackage, { timeoutMs }),
    listTags: async () => {
      tags ??= listTags(root);
      return tags;
    },
  };
}

/**
 * Whether a package's manifest version is cut but not yet released.
 *
 * That is the window between `hub release --cut` and the tag that publishes,
 * the only time `size.json` must match the working tree. A version that has its
 * tag is released, and `size.json` records it rather than the code since. A
 * package with no tag at all has never been released through a tag: its first
 * release is published by hand, where `hub publish` checks the file itself.
 * @param workspacePackage Package to inspect.
 * @param tags Every local tag name.
 * @returns True when the version awaits its release tag.
 */
function isPendingRelease(workspacePackage: WorkspacePackage, tags: readonly string[]): boolean {
  if (tags.includes(releaseTagFor(workspacePackage))) {
    return false;
  }
  const prefix = `${workspacePackage.name}@`;
  return tags.some((tag) => tag.startsWith(prefix));
}

async function run(
  workspacePackage: WorkspacePackage,
  sources: SizeRuleSources,
  timeoutMs: number | undefined,
): Promise<Finding[]> {
  if (!isPendingRelease(workspacePackage, await sources.listTags())) {
    return [];
  }
  const version = String(workspacePackage.manifest.version);
  const remeasure = `Run \`pnpm hub release ${workspacePackage.name} --cut=${version}\` to record it, and commit the result.`;
  const untagged = `${releaseTagFor(workspacePackage)} has no tag yet, so this version is awaiting release and \`hub publish\` will compare ${SIZE_FILE} with the build. If it is already released, run \`git fetch --tags\`.`;
  const exists = await access(join(workspacePackage.directory, SIZE_FILE)).then(
    () => true,
    // Any other error is not evidence of absence; the comparison reports it.
    (error: NodeJS.ErrnoException) => error.code !== "ENOENT",
  );
  if (!exists) {
    return [
      {
        code: "size/missing",
        location: SIZE_FILE,
        message: `No ${SIZE_FILE} for ${version}. ${untagged} ${remeasure}`,
        severity: "error",
      },
    ];
  }
  const check = await sources.checkSize(workspacePackage, timeoutMs);
  if (check.status === "ready") {
    return [];
  }
  return [
    {
      code: "size/stale",
      location: SIZE_FILE,
      message: `${check.detail}. ${untagged} ${remeasure}`,
      severity: "error",
    },
  ];
}

/**
 * Builds the `size` rule: a version awaiting release carries a `size.json` that matches its build.
 *
 * `hub check` inspects packages concurrently, and each comparison runs the
 * package's build, which can clean its `dist` while another package's build
 * reads it. The comparisons therefore run one at a time.
 * @param sources Tags and the size precondition.
 * @returns The rule.
 */
export function createSizeRules(sources: SizeRuleSources): CheckRule[] {
  let previous: Promise<void> = Promise.resolve();
  const serialized: SizeRuleSources = {
    ...sources,
    checkSize: async (workspacePackage, timeoutMs) => {
      const waitFor = previous;
      let release = (): void => undefined;
      previous = new Promise((resolve) => {
        release = resolve;
      });
      await waitFor;
      try {
        return await sources.checkSize(workspacePackage, timeoutMs);
      } finally {
        release();
      }
    },
  };
  return [
    {
      appliesTo: ({ isPrivate }) => !isPrivate,
      name: "size",
      run: ({ package: workspacePackage, timeoutMs }) => run(workspacePackage, serialized, timeoutMs),
      summary: "A version awaiting its release tag carries a size.json that matches its build.",
    },
  ];
}
