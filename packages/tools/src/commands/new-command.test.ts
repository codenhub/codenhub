import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { CommandContext } from "./definition.ts";
import { createNewCommand, resolveScope } from "./new-command.ts";

function createPackage(name: string, location: string): WorkspacePackage {
  return {
    directory: join("/repo", location),
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    location,
    manifest: { name },
    name,
    scripts: {},
    unscopedName: name.slice(name.lastIndexOf("/") + 1),
    workspaceDependencies: [],
  };
}

interface RunResult {
  exitCode: number;
  output: string;
  errors: string;
  root: string;
}

async function runNew(
  argv: readonly string[],
  packages: readonly WorkspacePackage[] = [createPackage("@codenhub/error", "packages/error")],
): Promise<RunResult> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-new-"));
  const lines: string[] = [];
  const errors: string[] = [];
  const parsed = parseArguments(["new", ...argv]);
  const context: CommandContext = {
    options: parsed.options,
    passthrough: parsed.passthrough,
    reporter: createReporter({
      useColor: false,
      write: (line) => lines.push(line),
      writeError: (line) => errors.push(line),
    }),
    selection: { isImplicit: false, targets: [], unownedPaths: [] },
    tokens: parsed.tokens,
    workspace: { packages, root },
  };

  const exitCode = await createNewCommand().run(context);
  return { errors: errors.join("\n"), exitCode, output: lines.join("\n"), root };
}

describe("resolveScope", () => {
  it("joins the scope the workspace already uses", () => {
    const packages = [
      createPackage("@codenhub/error", "packages/error"),
      createPackage("@codenhub/kbd", "packages/kbd"),
      createPackage("@other/one", "packages/one"),
    ];

    expect(resolveScope(packages)).toBe("@codenhub");
  });

  it("falls back to the default scope for an unscoped workspace", () => {
    expect(resolveScope([createPackage("plain", "packages/plain")])).toBe("@codenhub");
  });
});

describe("hub new", () => {
  it("writes every surface a public package needs", async () => {
    const result = await runNew(["widget", "--description=Widget helpers."]);

    const written = await readdir(join(result.root, "packages/widget"), { recursive: true });
    expect(written.map((entry) => entry.replaceAll("\\", "/")).sort()).toEqual([
      "README.md",
      "docs",
      "docs/.npmignore",
      "docs/index.md",
      "llms-full.txt",
      "llms.txt",
      "package.json",
      "src",
      "src/index.test.ts",
      "src/index.ts",
      "tsconfig.json",
    ]);
    expect(result.exitCode).toBe(0);
  });

  it("declares the metadata the lifecycle spec requires", async () => {
    const result = await runNew(["widget", "--description=Widget helpers."]);
    const manifest = JSON.parse(await readFile(join(result.root, "packages/widget/package.json"), "utf8"));

    expect(manifest.name).toBe("@codenhub/widget");
    expect(manifest.private).toBe(false);
    expect(manifest.type).toBe("module");
    expect(manifest.publishConfig).toEqual({ access: "public" });
    expect(manifest.codenhub.docs).toEqual({ label: "Widget", status: "experimental" });
    expect(Object.keys(manifest.scripts).sort()).toEqual([
      "build",
      "prepublishOnly",
      "status:npm",
      "status:pack",
      "test",
      "test:coverage",
      "test:watch",
      "typecheck",
    ]);
  });

  it("compiles llms-full.txt from the surfaces it just wrote", async () => {
    const result = await runNew(["widget", "--description=Widget helpers."]);

    const compiled = await readFile(join(result.root, "packages/widget/llms-full.txt"), "utf8");

    expect(compiled).toContain("@codenhub/widget");
    expect(compiled).toContain("<!-- Source: README.md -->");
  });

  it("derives a label from a hyphenated name", async () => {
    const result = await runNew(["sample-widget", "--description=Widget helpers."]);
    const manifest = JSON.parse(await readFile(join(result.root, "packages/sample-widget/package.json"), "utf8"));

    expect(manifest.codenhub.docs.label).toBe("Sample Widget");
  });

  it("writes nothing during a dry run", async () => {
    const result = await runNew(["widget", "--description=Widget helpers.", "--dry-run"]);

    expect(result.output).toContain("packages/widget/package.json");
    await expect(readdir(join(result.root, "packages/widget"))).rejects.toThrow();
  });

  it("refuses a name the workspace already uses", async () => {
    const result = await runNew(["error"]);

    expect(result.errors).toContain("@codenhub/error already exists");
    expect(result.exitCode).toBe(1);
  });

  it("refuses a directory that already exists", async () => {
    const first = await runNew(["widget", "--description=Widget helpers."]);
    const parsed = parseArguments(["new", "widget"]);
    const errors: string[] = [];
    const context: CommandContext = {
      options: parsed.options,
      passthrough: parsed.passthrough,
      reporter: createReporter({ useColor: false, write: () => {}, writeError: (line) => errors.push(line) }),
      selection: { isImplicit: false, targets: [], unownedPaths: [] },
      tokens: parsed.tokens,
      workspace: { packages: [], root: first.root },
    };

    await expect(createNewCommand().run(context)).rejects.toThrow("packages/widget already exists");
  });

  it("refuses a name that is not kebab-case", async () => {
    const result = await runNew(["Widget"]);

    expect(result.errors).toContain("Invalid package name");
    expect(result.exitCode).toBe(1);
  });

  it("refuses to create more than one package at a time", async () => {
    const result = await runNew(["one", "two"]);

    expect(result.errors).toContain("one package at a time");
    expect(result.exitCode).toBe(1);
  });

  it("reports usage when no name was given", async () => {
    const result = await runNew([]);

    expect(result.errors).toContain("Usage: hub new");
    expect(result.exitCode).toBe(1);
  });

  it("keeps the scaffolded test importable without a file extension", async () => {
    const result = await runNew(["widget", "--description=Widget helpers."]);

    const test = await readFile(join(result.root, "packages/widget/src/index.test.ts"), "utf8");

    // Built packages resolve through their bundler, which rejects a `.ts`
    // specifier; only the unbuilt tooling package writes them.
    expect(test).toContain(`from "./index"`);
    expect(test).not.toContain(`from "./index.ts"`);
  });
});
