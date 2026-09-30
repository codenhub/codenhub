import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createBrowsersCommand } from "./browsers-command.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext } from "./definition.ts";

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

/**
 * Installs a fake Playwright CLI that fails its first `failures` calls and then succeeds, counting its
 * calls in `attempts` beside the package so a test can read how often the install ran.
 */
async function installFakeCli(root: string, location: string, failures: number): Promise<string> {
  const directory = join(root, location);
  const binDirectory = join(directory, "node_modules", ".bin");
  await mkdir(binDirectory, { recursive: true });
  const script = join(binDirectory, "fake-install.cjs");
  await writeFile(
    script,
    `const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const count = (existsSync("attempts") ? Number(readFileSync("attempts", "utf8")) : 0) + 1;
writeFileSync("attempts", String(count));
process.exit(count <= ${failures} ? 1 : 0);
`,
  );
  await writeFile(join(binDirectory, "playwright.CMD"), `@node "${script}" %*\r\n`);
  await writeFile(join(binDirectory, "playwright"), `#!/bin/sh\nexec node "${script}" "$@"\n`);
  await chmod(join(binDirectory, "playwright"), 0o755);
  return join(directory, "attempts");
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

  it("retries a failed install once, so a stalled download or package mirror does not fail the run", async () => {
    const root = await createWorkspaceFixture("packages/toast", false);
    const attempts = await installFakeCli(root, "packages/toast", 1);
    const packages = [createPackage(root, "packages/toast", { devDependencies: { "@playwright/test": "catalog:" } })];

    const result = await runBrowsers(root, packages, []);

    expect(await readFile(attempts, "utf8")).toBe("2");
    expect(result.output).toContain("packages/toast › install failed, trying once more");
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("fails when the second attempt fails too, without trying a third time", async () => {
    const root = await createWorkspaceFixture("packages/toast", false);
    const attempts = await installFakeCli(root, "packages/toast", 2);
    const packages = [createPackage(root, "packages/toast", { devDependencies: { "@playwright/test": "catalog:" } })];

    const result = await runBrowsers(root, packages, []);

    expect(await readFile(attempts, "utf8")).toBe("2");
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("does not retry an install that succeeded", async () => {
    const root = await createWorkspaceFixture("packages/toast", false);
    const attempts = await installFakeCli(root, "packages/toast", 0);
    const packages = [createPackage(root, "packages/toast", { devDependencies: { "@playwright/test": "catalog:" } })];

    const result = await runBrowsers(root, packages, []);

    expect(await readFile(attempts, "utf8")).toBe("1");
    expect(result.output).not.toContain("trying once more");
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
