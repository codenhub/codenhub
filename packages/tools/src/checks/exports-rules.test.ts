import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createExportsRules } from "./exports-rules.ts";
import type { Finding } from "./rule.ts";

const EXPORTS = { ".": "./dist/index.js", "./browser": "./dist/browser.js" };

interface Fixture {
  files: Record<string, string>;
  exports?: unknown;
}

async function runRule(fixture: Fixture): Promise<Finding[]> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-exports-rule-"));
  await mkdir(join(directory, "docs", "internal"), { recursive: true });
  await Promise.all(
    Object.entries(fixture.files).map(([path, contents]) => writeFile(join(directory, path), contents, "utf8")),
  );
  const workspacePackage = {
    directory,
    isPrivate: false,
    location: "packages/example",
    manifest: {
      codenhub: { docs: { label: "Example", status: "active" } },
      exports: "exports" in fixture ? fixture.exports : EXPORTS,
      name: "@codenhub/example",
    },
    name: "@codenhub/example",
  } as unknown as WorkspacePackage;
  const [rule] = createExportsRules();

  return rule === undefined ? [] : rule.run({ includePack: false, package: workspacePackage });
}

describe("documented exports rule", () => {
  it("accepts a documented import that the manifest declares", async () => {
    const files = {
      "README.md": '# Example\n\n```ts\nimport { create } from "@codenhub/example";\n```\n',
      "docs/index.md": '---\ntitle: Example\n---\n\n```ts\nimport { watch } from "@codenhub/example/browser";\n```\n',
    };

    expect(await runRule({ files })).toEqual([]);
  });

  it("reports a documented import missing from exports", async () => {
    const files = { "README.md": '# Example\n\n```ts\nimport { create } from "@codenhub/example/node";\n```\n' };

    expect(await runRule({ files })).toEqual([
      {
        code: "exports/undocumented-import",
        location: "README.md",
        message: `Documented import "@codenhub/example/node" is not declared in "exports".`,
        severity: "error",
      },
    ]);
  });

  it("reports an undeclared import shown in a public document", async () => {
    const files = {
      "README.md": "# Example\n",
      "docs/index.md": '---\ntitle: Example\n---\n\n```ts\nimport "@codenhub/example/node";\n```\n',
    };

    expect((await runRule({ files })).map(({ location }) => location)).toEqual(["docs/index.md"]);
  });

  it("reports an undeclared import once however many examples show it", async () => {
    const specifier = 'import { create } from "@codenhub/example/node";';
    const files = {
      "README.md": `# Example\n\n\`\`\`ts\n${specifier}\n\`\`\`\n\n\`\`\`ts\n${specifier}\n\`\`\`\n`,
      "docs/index.md": `---\ntitle: Example\n---\n\n\`\`\`ts\n${specifier}\n\`\`\`\n`,
    };

    expect(await runRule({ files })).toHaveLength(1);
  });

  it("ignores imports documented only for maintainers", async () => {
    const files = {
      "README.md": "# Example\n",
      "docs/internal/architecture.md": '```ts\nimport { internals } from "@codenhub/example/node";\n```\n',
    };

    expect(await runRule({ files })).toEqual([]);
  });

  it("ignores a package path mentioned in prose rather than imported", async () => {
    const files = { "README.md": "# Example\n\nThe `@codenhub/example/node` build is not published.\n" };

    expect(await runRule({ files })).toEqual([]);
  });

  it("ignores imports of other packages", async () => {
    const files = { "README.md": '# Example\n\n```ts\nimport { other } from "@codenhub/other/node";\n```\n' };

    expect(await runRule({ files })).toEqual([]);
  });

  it("accepts a subpath covered by a wildcard export", async () => {
    const files = { "README.md": '# Example\n\n```ts\nimport "@codenhub/example/locales/en.json";\n```\n' };

    expect(await runRule({ exports: { "./locales/*": "./dist/locales/*" }, files })).toEqual([]);
  });

  it("accepts the root import of a conditions-only exports object", async () => {
    const files = { "README.md": '# Example\n\n```ts\nimport { create } from "@codenhub/example";\n```\n' };

    expect(await runRule({ exports: { import: "./dist/index.js", types: "./dist/index.d.ts" }, files })).toEqual([]);
  });

  it("reports a CSS import missing from exports", async () => {
    const files = { "README.md": '# Example\n\n```css\n@import "@codenhub/example/styles.css";\n```\n' };

    expect((await runRule({ files })).map(({ code }) => code)).toEqual(["exports/undocumented-import"]);
  });

  it("stays quiet when the manifest declares no exports at all", async () => {
    const files = { "README.md": '# Example\n\n```ts\nimport "@codenhub/example/node";\n```\n' };

    expect(await runRule({ exports: undefined, files })).toEqual([]);
  });
});
