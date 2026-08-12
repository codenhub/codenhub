/** What a new public package needs to be named and described. */
export interface PackageTemplateOptions {
  /** npm scope, such as `@codenhub`. */
  scope: string;
  /** Unscoped package name, such as `store`. */
  name: string;
  /** One-sentence description used by the manifest and the generated package list. */
  description: string;
  /** Documentation label shown in navigation. */
  label: string;
  /** Repository-relative package location, such as `packages/store`. */
  location: string;
}

/** One scaffolded file. */
export interface TemplateFile {
  /** Package-relative POSIX path. */
  path: string;
  /** Contents the file should be created with. */
  contents: string;
}

/**
 * Turns a package name into a documentation label.
 *
 * The label is what a reader sees in navigation, so a hyphenated directory name
 * becomes separate capitalized words.
 * @param name Unscoped package name.
 * @returns Title-cased label.
 */
export function toLabel(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Turns a package name into a camel-cased identifier.
 * @param name Unscoped package name.
 * @returns Identifier safe to use as an exported symbol.
 */
export function toIdentifier(name: string): string {
  const [first = "", ...rest] = name.split("-");
  return [first, ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1))].join("");
}

function createManifest(options: PackageTemplateOptions, fullName: string): string {
  const manifest = {
    name: fullName,
    version: "0.0.1",
    private: false,
    description: options.description,
    homepage: `https://github.com/codenhub/codenhub/tree/main/${options.location}`,
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "git+https://github.com/codenhub/codenhub.git",
      directory: options.location,
    },
    files: ["dist", "docs", "llms.txt", "llms-full.txt"],
    type: "module",
    main: "./dist/index.js",
    module: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
    publishConfig: {
      access: "public",
    },
    scripts: {
      build: "tsdown src/index.ts --format esm --dts --clean --no-fixed-extension",
      prepublishOnly: "pnpm build && pnpm typecheck",
      "status:npm": `npm view ${fullName} version dist-tags time --json && npm dist-tag ls ${fullName} && npm access get status ${fullName}`,
      "status:pack": "npm pack --dry-run --ignore-scripts",
      test: "vitest run",
      "test:coverage": "vitest run --coverage",
      "test:watch": "vitest",
      typecheck: "tsc -b",
    },
    devDependencies: {
      "@vitest/coverage-v8": "catalog:",
      tsdown: "catalog:",
      typescript: "catalog:",
      vitest: "catalog:",
    },
    codenhub: {
      docs: {
        label: options.label,
        // Every new package starts experimental. Promoting it is a deliberate
        // act that has to update the README notice at the same time.
        status: "experimental",
      },
    },
  };
  return `${JSON.stringify(manifest, undefined, 2)}\n`;
}

/**
 * Builds every file a new public package starts with.
 *
 * The result satisfies the lifecycle, documentation, and README specs on the
 * first run of `hub check`, so the author edits prose rather than hunting for
 * the fields and surfaces a package is required to have.
 * @param options Package identity and description.
 * @returns Files to create, in no particular order.
 */
export function createPackageFiles(options: PackageTemplateOptions): TemplateFile[] {
  const fullName = `${options.scope}/${options.name}`;
  const identifier = toIdentifier(options.name);
  const factory = `create${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}`;

  return [
    { contents: createManifest(options, fullName), path: "package.json" },
    {
      // Written literally rather than serialized: `JSON.stringify` expands a
      // short array onto its own lines and the formatter folds it back, so a
      // serialized tsconfig would arrive already failing `hub format`.
      contents: [
        "{",
        `  "compilerOptions": {`,
        // `composite` and `noEmit` are what let `hub typecheck` check this
        // package beside the others and skip it when nothing changed.
        `    "composite": true,`,
        `    "lib": ["DOM", "ES2024"],`,
        `    "module": "Preserve",`,
        `    "moduleResolution": "bundler",`,
        `    "noEmit": true`,
        "  },",
        `  "extends": "../../tsconfig.json",`,
        `  "include": ["src/**/*"]`,
        "}",
        "",
      ].join("\n"),
      path: "tsconfig.json",
    },
    {
      contents: [
        `# ${fullName}`,
        "",
        options.description,
        "",
        "> **Experimental:** The public API, behavior, and build output may change",
        "> before a stable release.",
        "",
        "## Installation",
        "",
        "```sh",
        `pnpm add ${fullName}`,
        "```",
        "",
        "## Usage",
        "",
        "TODO: replace this with one minimal example of the main use case.",
        "",
        "```ts",
        `import { ${factory} } from "${fullName}";`,
        "",
        `const ${identifier} = ${factory}();`,
        "```",
        "",
        "## Documentation",
        "",
        "- [Documentation overview](docs/index.md)",
        "",
        "## Requirements",
        "",
        "- ESM-aware package resolution.",
        "- No runtime dependencies.",
        "",
        "## License",
        "",
        "Licensed under Apache-2.0.",
        "",
      ].join("\n"),
      path: "README.md",
    },
    {
      contents: [
        `# ${fullName}`,
        "",
        `> ${options.description} The package is experimental.`,
        "",
        "TODO: replace this with the editorial summary a reader needs to decide",
        "whether this package solves their problem.",
        "",
        "## Documentation",
        "",
        "- [Documentation overview](docs/index.md): Scope, stability, entrypoint, and",
        "  navigation.",
        "",
      ].join("\n"),
      path: "llms.txt",
    },
    {
      contents: [
        "---",
        "title: Overview",
        "---",
        "",
        `# ${options.label}`,
        "",
        `\`${fullName}\` ${options.description.charAt(0).toLowerCase()}${options.description.slice(1)}`,
        "",
        "TODO: replace this with what the package does and when to reach for it.",
        "",
        "## Setup",
        "",
        "### Installation",
        "",
        "```sh",
        `pnpm add ${fullName}`,
        "```",
        "",
        "### Quick start",
        "",
        "```ts",
        `import { ${factory} } from "${fullName}";`,
        "",
        `const ${identifier} = ${factory}();`,
        "```",
        "",
        "## Requirements",
        "",
        "- ESM-aware package resolution.",
        "- No runtime dependencies.",
        "",
        `All public symbols are imported from \`${fullName}\`; there are no public`,
        "subpath exports.",
        "",
      ].join("\n"),
      path: "docs/index.md",
    },
    // Maintainer documentation is written for this repository, not for consumers,
    // so it is kept out of the published tarball.
    { contents: "internal/\n", path: "docs/.npmignore" },
    {
      contents: [
        `/** What {@link ${factory}} accepts. */`,
        `export interface ${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}Options {`,
        "  /** TODO: describe the first option. */",
        "  placeholder?: string;",
        "}",
        "",
        "/**",
        " * TODO: describe what this creates and why a consumer would call it.",
        " * @param options TODO: describe the options.",
        " * @returns TODO: describe the result.",
        " */",
        `export function ${factory}(options: ${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}Options = {}): string {`,
        `  return options.placeholder ?? "${options.name}";`,
        "}",
        "",
      ].join("\n"),
      path: "src/index.ts",
    },
    {
      contents: [
        `import { describe, expect, it } from "vitest";`,
        "",
        `import { ${factory} } from "./index";`,
        "",
        `describe("${factory}", () => {`,
        `  it("falls back to the package name", () => {`,
        `    expect(${factory}()).toBe("${options.name}");`,
        "  });",
        "",
        `  it("uses the placeholder it is given", () => {`,
        `    expect(${factory}({ placeholder: "given" })).toBe("given");`,
        "  });",
        "});",
        "",
      ].join("\n"),
      path: "src/index.test.ts",
    },
  ];
}
