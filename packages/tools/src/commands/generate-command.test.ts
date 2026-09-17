import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext } from "./definition.ts";
import { createGenerateCommand } from "./generate-command.ts";

const README = [
  "# CodenHub",
  "",
  "<!-- generated: packages start -->",
  "",
  "- stale",
  "",
  "<!-- generated: packages end -->",
].join("\n");

const INDEX = "---\ntitle: Example\n---\n\n# Example\n\n[Guide](guide.md)\n";
const GUIDE = "---\ntitle: Guide\n---\n\n# Guide\n";
const PACKAGE_README = "# @codenhub/example\n\nAn example package.\n";

interface WorkspaceFixture {
  root: string;
  packages: WorkspacePackage[];
}

/**
 * Writes a repository holding one documented package.
 * @returns Repository root and its workspace packages.
 */
async function createFixture(): Promise<WorkspaceFixture> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-generate-"));
  const location = "packages/example";
  const directory = join(root, location);
  await mkdir(join(directory, "docs"), { recursive: true });
  await writeFile(join(root, "README.md"), README, "utf8");
  await writeFile(join(directory, "README.md"), PACKAGE_README, "utf8");
  await writeFile(join(directory, "docs", "index.md"), INDEX, "utf8");
  await writeFile(join(directory, "docs", "guide.md"), GUIDE, "utf8");

  return {
    packages: [
      {
        directory,
        directoryName: "example",
        isPrivate: false,
        location,
        manifest: { description: "An example package.", name: "@codenhub/example" },
        name: "@codenhub/example",
        scripts: {},
        unscopedName: "example",
        workspaceDependencies: [],
      },
    ],
    root,
  };
}

async function runGenerate(fixture: WorkspaceFixture, argv: readonly string[] = ["generate"]): Promise<number> {
  const context: CommandContext = {
    options: parseArguments(argv).options,
    passthrough: [],
    reporter: createReporter({ useColor: false, write: () => {}, writeError: () => {} }),
    selection: {
      isImplicit: true,
      targets: fixture.packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    },
    tokens: [],
    workspace: { packages: fixture.packages, root: fixture.root },
  };

  return createGenerateCommand().run(context);
}

describe("hub generate", () => {
  it("compiles the package README and public docs into llms-full.txt", async () => {
    const fixture = await createFixture();

    await runGenerate(fixture);

    const contents = await readFile(join(fixture.root, "packages/example/llms-full.txt"), "utf8");
    expect(contents).toContain("<!-- Source: README.md -->");
    expect(contents).toContain("<!-- Source: docs/index.md -->");
    expect(contents).toContain("<!-- Source: docs/guide.md -->");
  });

  it("rebases document links so they resolve from the package root", async () => {
    const fixture = await createFixture();

    await runGenerate(fixture);

    expect(await readFile(join(fixture.root, "packages/example/llms-full.txt"), "utf8")).toContain(
      "[Guide](docs/guide.md)",
    );
  });

  it("strips presentation frontmatter from copied documents", async () => {
    const fixture = await createFixture();

    await runGenerate(fixture);

    expect(await readFile(join(fixture.root, "packages/example/llms-full.txt"), "utf8")).not.toContain("title:");
  });

  it("rewrites the root README package list from manifests", async () => {
    const fixture = await createFixture();

    await runGenerate(fixture);

    const contents = await readFile(join(fixture.root, "README.md"), "utf8");
    expect(contents).toContain("- `packages/example`: An example package.");
    expect(contents).not.toContain("- stale");
  });

  it("leaves an up-to-date file untouched", async () => {
    const fixture = await createFixture();
    await runGenerate(fixture);
    const generatedPath = join(fixture.root, "packages/example/llms-full.txt");
    const firstWrite = (await stat(generatedPath)).mtimeMs;

    await runGenerate(fixture);

    expect((await stat(generatedPath)).mtimeMs).toBe(firstWrite);
  });

  it("writes nothing during a dry run", async () => {
    const fixture = await createFixture();

    await runGenerate(fixture, ["generate", "--dry-run"]);

    await expect(stat(join(fixture.root, "packages/example/llms-full.txt"))).rejects.toThrow("ENOENT");
  });

  it("fails a dry run that found stale files", async () => {
    const fixture = await createFixture();

    expect(await runGenerate(fixture, ["generate", "--dry-run"])).toBe(EXIT_FAILURE);
  });

  it("passes a dry run once every generated file is current", async () => {
    const fixture = await createFixture();
    await runGenerate(fixture);

    expect(await runGenerate(fixture, ["generate", "--dry-run"])).toBe(EXIT_SUCCESS);
  });

  it("regenerates a file whose source document changed", async () => {
    const fixture = await createFixture();
    await runGenerate(fixture);
    await writeFile(join(fixture.root, "packages/example/docs/guide.md"), `${GUIDE}\nNew guidance.\n`, "utf8");

    await runGenerate(fixture);

    expect(await readFile(join(fixture.root, "packages/example/llms-full.txt"), "utf8")).toContain("New guidance.");
  });
});

describe("hub generate › package-owned generate scripts", () => {
  /**
   * Writes a repository holding one package with its own `generate` script and
   * one without, so dispatch to the owning package and skipping the other can
   * both be proven from the same fixture.
   */
  async function createPackageScriptFixture(): Promise<WorkspaceFixture> {
    const root = await mkdtemp(join(tmpdir(), "codenhub-generate-pkg-"));
    const withScriptDirectory = join(root, "packages/with-script");
    const withoutScriptDirectory = join(root, "packages/without-script");

    await mkdir(withScriptDirectory, { recursive: true });
    await mkdir(withoutScriptDirectory, { recursive: true });
    await writeFile(join(root, "README.md"), README, "utf8");
    await writeFile(
      join(withScriptDirectory, "README.md"),
      "# @codenhub/with-script\n\nHas a generate script.\n",
      "utf8",
    );
    await writeFile(
      join(withoutScriptDirectory, "README.md"),
      "# @codenhub/without-script\n\nHas no generate script.\n",
      "utf8",
    );
    // Records whether it was asked to check or write, then fails a dry run
    // unconditionally -- proof the command forwards `--dry-run` rather than
    // deciding drift on its own behalf.
    await writeFile(
      join(withScriptDirectory, "generate.mjs"),
      [
        'import { writeFileSync } from "node:fs";',
        'const isDryRun = process.argv.includes("--dry-run");',
        'writeFileSync("ran.json", JSON.stringify({ isDryRun }));',
        "if (isDryRun) {",
        "  process.exitCode = 1;",
        "}",
      ].join("\n"),
      "utf8",
    );

    return {
      packages: [
        {
          directory: withScriptDirectory,
          directoryName: "with-script",
          isPrivate: false,
          location: "packages/with-script",
          manifest: { description: "Has a generate script.", name: "@codenhub/with-script" },
          name: "@codenhub/with-script",
          scripts: { generate: "node generate.mjs" },
          unscopedName: "with-script",
          workspaceDependencies: [],
        },
        {
          directory: withoutScriptDirectory,
          directoryName: "without-script",
          isPrivate: false,
          location: "packages/without-script",
          manifest: { description: "Has no generate script.", name: "@codenhub/without-script" },
          name: "@codenhub/without-script",
          scripts: {},
          unscopedName: "without-script",
          workspaceDependencies: [],
        },
      ],
      root,
    };
  }

  it("runs the generate script a package owns", async () => {
    const fixture = await createPackageScriptFixture();

    await runGenerate(fixture);

    const ran: unknown = JSON.parse(await readFile(join(fixture.packages[0]!.directory, "ran.json"), "utf8"));
    expect(ran).toEqual({ isDryRun: false });
  });

  it("leaves a package with no generate script alone", async () => {
    const fixture = await createPackageScriptFixture();

    await runGenerate(fixture);

    await expect(readFile(join(fixture.packages[1]!.directory, "ran.json"), "utf8")).rejects.toThrow("ENOENT");
  });

  it("forwards --dry-run and fails when a package's own script reports drift", async () => {
    const fixture = await createPackageScriptFixture();

    expect(await runGenerate(fixture, ["generate", "--dry-run"])).toBe(EXIT_FAILURE);

    const ran: unknown = JSON.parse(await readFile(join(fixture.packages[0]!.directory, "ran.json"), "utf8"));
    expect(ran).toEqual({ isDryRun: true });
  });
});
