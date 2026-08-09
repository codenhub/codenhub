import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createBrowsersCommand } from "./browsers-command.ts";
import { EXIT_SUCCESS, type CommandContext } from "./definition.ts";

async function createWorkspaceFixture(location: string, installsCli: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-browsers-command-"));
  await mkdir(join(root, location), { recursive: true });
  if (installsCli) {
    const binDirectory = join(root, location, "node_modules", ".bin");
    await mkdir(binDirectory, { recursive: true });
    await Promise.all(["playwright", "playwright.CMD"].map(async (name) => writeFile(join(binDirectory, name), "")));
  }
  return root;
}

function createPackage(root: string, location: string, manifest: Record<string, unknown>): WorkspacePackage {
  const name = location.slice(location.lastIndexOf("/") + 1);
  return {
    directory: join(root, location),
    directoryName: name,
    isPrivate: false,
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

async function runBrowsers(
  root: string,
  packages: readonly WorkspacePackage[],
  argv: readonly string[],
): Promise<RunResult> {
  const lines: string[] = [];
  const parsed = parseArguments(["browsers", ...argv]);
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

  return { exitCode: await createBrowsersCommand().run(context), output: lines.join("\n") };
}

describe("hub browsers", () => {
  it("prints the install it would run", async () => {
    const root = await createWorkspaceFixture("packages/toast", true);
    const packages = [createPackage(root, "packages/toast", { devDependencies: { "@playwright/test": "catalog:" } })];

    const result = await runBrowsers(root, packages, ["--dry-run", "--with-deps"]);

    expect(result.output).toContain("Would install browsers for 1 Playwright version(s)");
    expect(result.output).toContain("install --with-deps");
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("reports nothing to do when no package tests in a browser", async () => {
    const root = await createWorkspaceFixture("packages/error", false);
    const packages = [createPackage(root, "packages/error", { devDependencies: { vitest: "catalog:" } })];

    const result = await runBrowsers(root, packages, []);

    expect(result.output).toContain("No selected package declares @playwright/test.");
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });
});
