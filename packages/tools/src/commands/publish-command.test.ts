import { describe, expect, it, vi } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import type { PublishRunner } from "../release/publish.ts";
import type { ReadinessOptions, ReleaseRunner } from "../release/readiness.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import { createPublishCommand } from "./publish-command.ts";

function createPackage(name: string, version = "1.0.0", isPrivate = false): WorkspacePackage {
  const unscopedName = name.slice(name.lastIndexOf("/") + 1);
  return {
    directory: `/repo/packages/${unscopedName}`,
    directoryName: unscopedName,
    isPrivate,
    location: `packages/${unscopedName}`,
    manifest: { exports: { ".": "./dist/index.js" }, name, private: isPrivate, version },
    name,
    scripts: {},
    unscopedName,
    workspaceDependencies: [],
  };
}

/** Answers `npm view` with an older published version and `git status` with a clean tree. */
const runner: ReleaseRunner = vi.fn(async (command: string) =>
  command === "npm" ? { isSuccess: true, stdout: JSON.stringify("0.9.0") } : { isSuccess: true, stdout: "" },
);

const readiness: ReadinessOptions = { readPack: async () => new Set(["dist/index.js"]), run: runner };

interface RunResult {
  exitCode: number;
  output: string;
  errors: string;
  published: string[];
}

async function runPublish(
  packages: readonly WorkspacePackage[],
  argv: readonly string[],
  overrides: {
    verifyExitCode?: number;
    publishSucceeds?: boolean;
    readiness?: ReadinessOptions;
    servedVersion?: string;
  } = {},
): Promise<RunResult> {
  const lines: string[] = [];
  const errors: string[] = [];
  const published: string[] = [];
  const publish: PublishRunner = async (workspacePackage) => {
    published.push(workspacePackage.name);
    return { isSuccess: overrides.publishSucceeds ?? true, output: "npm said so" };
  };
  const resolver = (name: string): CommandDefinition => ({
    name,
    run: async () => overrides.verifyExitCode ?? EXIT_SUCCESS,
    summary: name,
    usage: name,
  });
  const parsed = parseArguments(["publish", ...argv]);
  const context: CommandContext = {
    options: parsed.options,
    passthrough: parsed.passthrough,
    reporter: createReporter({
      useColor: false,
      write: (line) => lines.push(line),
      writeError: (line) => errors.push(line),
    }),
    selection: {
      // A tag names its own package, so these tests select nothing explicitly
      // unless a case is about selectors.
      isImplicit: parsed.tokens.length === 0,
      targets: packages
        .filter(({ unscopedName }) => parsed.tokens.length === 0 || parsed.tokens.includes(unscopedName))
        .map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    },
    tokens: parsed.tokens,
    workspace: { packages, root: "/repo" },
  };

  const command = createPublishCommand(resolver, {
    publish,
    readiness: overrides.readiness ?? readiness,
    readPublished: async () => overrides.servedVersion,
  });
  const exitCode = await command.run(context);
  return { errors: errors.join("\n"), exitCode, output: lines.join("\n"), published };
}

describe("hub publish", () => {
  it("publishes the package a release tag names", async () => {
    const result = await runPublish([createPackage("@codenhub/error", "1.0.0")], ["--from-tag=@codenhub/error@1.0.0"]);

    expect(result.published).toEqual(["@codenhub/error"]);
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("refuses a tag whose version disagrees with the manifest", async () => {
    const result = await runPublish([createPackage("@codenhub/error", "1.0.0")], ["--from-tag=@codenhub/error@2.0.0"]);

    expect(result.errors).toContain("declares 1.0.0 but the tag releases 2.0.0");
    expect(result.published).toEqual([]);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("refuses a tag naming a package the workspace does not have", async () => {
    const result = await runPublish([createPackage("@codenhub/error")], ["--from-tag=@codenhub/ghost@1.0.0"]);

    expect(result.errors).toContain(`no workspace package is named "@codenhub/ghost"`);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("refuses a tag naming a private package", async () => {
    const result = await runPublish(
      [createPackage("@codenhub/tools", "1.0.0", true)],
      ["--from-tag=@codenhub/tools@1.0.0"],
    );

    expect(result.errors).toContain("is private and is never published");
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("refuses a tag that is not shaped like one", async () => {
    const result = await runPublish([createPackage("@codenhub/error")], ["--from-tag=v1.0.0"]);

    expect(result.errors).toContain("is not a release tag");
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("asks for the value of --from-tag to be joined with an equals sign", async () => {
    const result = await runPublish([createPackage("@codenhub/error")], ["--from-tag", "@codenhub/error@1.0.0"]);

    expect(result.errors).toContain(`takes its value with "="`);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("refuses an implicit selection rather than publishing the workspace", async () => {
    const result = await runPublish([createPackage("@codenhub/error"), createPackage("@codenhub/icons")], []);

    expect(result.errors).toContain("Name the package to publish");
    expect(result.published).toEqual([]);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("publishes what an explicit selector names", async () => {
    const packages = [createPackage("@codenhub/error"), createPackage("@codenhub/icons")];

    const result = await runPublish(packages, ["error"]);

    expect(result.published).toEqual(["@codenhub/error"]);
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("stops at a failing verification rather than publishing", async () => {
    const result = await runPublish([createPackage("@codenhub/error", "1.0.0")], ["--from-tag=@codenhub/error@1.0.0"], {
      verifyExitCode: EXIT_FAILURE,
    });

    expect(result.errors).toContain("nothing was published");
    expect(result.published).toEqual([]);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("stops at a blocked precondition rather than publishing", async () => {
    const stale: ReadinessOptions = {
      readPack: async () => new Set(["dist/index.js"]),
      run: async (command) =>
        command === "npm" ? { isSuccess: true, stdout: JSON.stringify("2.0.0") } : { isSuccess: true, stdout: "" },
    };

    const result = await runPublish([createPackage("@codenhub/error", "1.0.0")], ["--from-tag=@codenhub/error@1.0.0"], {
      readiness: stale,
    });

    expect(result.output).toContain("is not newer than the published 2.0.0");
    expect(result.published).toEqual([]);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("treats an unresolved precondition as a blocker, unlike the release report", async () => {
    const unknown: ReadinessOptions = {
      readPack: async () => {
        throw new Error("npm pack could not run");
      },
      run: runner,
    };

    const result = await runPublish([createPackage("@codenhub/error", "1.0.0")], ["--from-tag=@codenhub/error@1.0.0"], {
      readiness: unknown,
    });

    expect(result.errors).toContain("is not ready to publish");
    expect(result.published).toEqual([]);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("reports what it would run under --dry-run without publishing", async () => {
    const result = await runPublish(
      [createPackage("@codenhub/error", "1.0.0")],
      ["--from-tag=@codenhub/error@1.0.0", "--dry-run"],
    );

    expect(result.output).toContain("would run: npm publish --access public");
    expect(result.published).toEqual([]);
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("reports the failure when npm publish itself fails", async () => {
    const result = await runPublish([createPackage("@codenhub/error", "1.0.0")], ["--from-tag=@codenhub/error@1.0.0"], {
      publishSucceeds: false,
    });

    expect(result.errors).toContain("npm publish failed for @codenhub/error");
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("confirms what the registry serves after publishing", async () => {
    const result = await runPublish([createPackage("@codenhub/error", "1.0.0")], ["--from-tag=@codenhub/error@1.0.0"], {
      servedVersion: "1.0.0",
    });

    expect(result.output).toContain("the registry serves 1.0.0");
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("succeeds when the registry has not caught up yet", async () => {
    const result = await runPublish([createPackage("@codenhub/error", "1.0.0")], ["--from-tag=@codenhub/error@1.0.0"], {
      servedVersion: "0.9.0",
    });

    expect(result.output).toContain("metadata may still be propagating");
    expect(result.published).toEqual(["@codenhub/error"]);
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("skips verification on request", async () => {
    const result = await runPublish(
      [createPackage("@codenhub/error", "1.0.0")],
      ["--from-tag=@codenhub/error@1.0.0", "--skip-verify"],
      { verifyExitCode: EXIT_FAILURE },
    );

    expect(result.published).toEqual(["@codenhub/error"]);
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });
});
