import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createAssetsCommand } from "./assets-command.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext } from "./definition.ts";

async function createWorkspaceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-assets-command-"));
  await mkdir(join(root, "assets", "favicon"), { recursive: true });
  await writeFile(join(root, "assets", "favicon", "favicon.ico"), "favicon-bytes");
  return root;
}

function createPackage(root: string, location: string, manifest: Record<string, unknown>): WorkspacePackage {
  const name = location.slice(location.lastIndexOf("/") + 1);
  return {
    directory: join(root, location),
    directoryName: name,
    isPrivate: true,
    location,
    manifest,
    name: `@codenhub/${name}`,
    scripts: {},
    unscopedName: name,
    workspaceDependencies: [],
  };
}

interface RunResult {
  exitCode: number;
  output: string;
}

async function runAssets(
  root: string,
  packages: readonly WorkspacePackage[],
  argv: readonly string[],
): Promise<RunResult> {
  const lines: string[] = [];
  const parsed = parseArguments(["assets", ...argv]);
  const context: CommandContext = {
    options: parsed.options,
    passthrough: parsed.passthrough,
    reporter: createReporter({
      useColor: false,
      write: (line) => lines.push(line),
      writeError: (line) => lines.push(line),
    }),
    selection: {
      isImplicit: true,
      targets: packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    },
    tokens: [],
    workspace: { packages, root },
  };

  return { exitCode: await createAssetsCommand().run(context), output: lines.join("\n") };
}

describe("hub assets", () => {
  it("copies every declared entry to its own destination", async () => {
    const root = await createWorkspaceFixture();
    const packages = [
      createPackage(root, "apps/demo", {
        codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      }),
    ];
    await mkdir(packages[0]!.directory, { recursive: true });

    const result = await runAssets(root, packages, []);

    expect(result.exitCode).toBe(EXIT_SUCCESS);
    await expect(readFile(join(packages[0]!.directory, "public/favicon.ico"), "utf8")).resolves.toBe("favicon-bytes");
  });

  it("reports nothing to do when no package declares codenhub.assets", async () => {
    const root = await createWorkspaceFixture();
    const packages = [createPackage(root, "apps/demo", {})];

    const result = await runAssets(root, packages, []);

    expect(result.output).toContain("No selected package declares codenhub.assets.");
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("prints what it would sync under --dry-run without touching disk", async () => {
    const root = await createWorkspaceFixture();
    const packages = [
      createPackage(root, "apps/demo", {
        codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      }),
    ];

    const result = await runAssets(root, packages, ["--dry-run"]);

    expect(result.output).toContain("Would sync assets for 1 package(s)");
    await expect(readFile(join(packages[0]!.directory, "public/favicon.ico"), "utf8")).rejects.toThrow("ENOENT");
  });

  it("fails and reports when a declared source is missing", async () => {
    const root = await createWorkspaceFixture();
    const packages = [
      createPackage(root, "apps/demo", {
        codenhub: { assets: [{ from: "favicon/missing.ico", to: "public/favicon.ico" }] },
      }),
    ];
    await mkdir(packages[0]!.directory, { recursive: true });

    const result = await runAssets(root, packages, []);

    expect(result.output).toContain("does not exist under assets/");
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });
});
