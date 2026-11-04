import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import type { Finding } from "./rule.ts";
import { createTranslationRules } from "./translation-rules.ts";

const README = "# @codenhub/example\n\n[Docs](docs/index.md)\n";
const INDEX = "---\ntitle: Example\n---\n\n# Example\n\n[Start](./start.md)\n";
const START = "---\ntitle: Start\norder: 1\n---\n\n# Start\n";

/** The blob ID git records for LF-only contents. */
function blobId(contents: string): string {
  const bytes = Buffer.from(contents, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function translatedDocument(fields: string, body: string): string {
  return `---\n${fields}\n---\n\n${body}`;
}

async function createPackage(files: Record<string, string>): Promise<WorkspacePackage> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-translation-rule-"));
  const all = { "README.md": README, "docs/index.md": INDEX, "docs/start.md": START, ...files };
  await Promise.all(
    Object.entries(all).map(async ([path, contents]) => {
      await mkdir(join(directory, path, ".."), { recursive: true });
      await writeFile(join(directory, path), contents, "utf8");
    }),
  );
  return {
    directory,
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: { codenhub: { docs: {}, label: "Example", status: "active" }, name: "@codenhub/example" },
    name: "@codenhub/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

async function check(files: Record<string, string>): Promise<Finding[]> {
  const [rule] = createTranslationRules();
  return rule!.run({ includePack: false, package: await createPackage(files) });
}

describe("translation rule", () => {
  it("reports nothing for a package with no translations", async () => {
    expect(await check({})).toEqual([]);
  });

  it("reports nothing for current translations that link translated pages", async () => {
    const findings = await check({
      "README.pt-BR.md": `<!-- source: ${blobId(README)} -->\n\n# @codenhub/example\n\n[Docs](docs/pt-BR/index.md)\n`,
      "docs/pt-BR/index.md": translatedDocument(
        `title: Exemplo\nsource: ${blobId(INDEX)}`,
        "# Exemplo\n\n[Início](./start.md)\n",
      ),
      "docs/pt-BR/start.md": translatedDocument(`title: Início\norder: 1\nsource: ${blobId(START)}`, "# Início\n"),
    });
    expect(findings).toEqual([]);
  });

  it("warns about a stale translation and names the diff that updates it", async () => {
    const old = blobId("---\ntitle: Start\n---\n\n# Start (old)\n");
    const findings = await check({
      "docs/es/start.md": translatedDocument(`title: Inicio\norder: 1\nsource: ${old}`, "# Inicio\n"),
    });
    expect(findings).toEqual([
      expect.objectContaining({ code: "translation/stale", location: "docs/es/start.md", severity: "warning" }),
    ]);
    expect(findings[0]?.message).toContain(`git diff ${old} ${blobId(START)}`);
  });

  it("errors on a translation with no English counterpart, including a README", async () => {
    const findings = await check({
      "docs/es/extra.md": translatedDocument(`title: Extra\nsource: ${"a".repeat(40)}`, "# Extra\n"),
    });
    expect(findings).toEqual([
      expect.objectContaining({ code: "translation/missing-english", location: "docs/es/extra.md", severity: "error" }),
    ]);
  });

  it("errors once per area in an unlisted locale", async () => {
    const findings = await check({
      "README.fr.md": "# @codenhub/example\n",
      "docs/fr/index.md": translatedDocument("title: Exemple", "# Exemple\n"),
      "docs/fr/start.md": translatedDocument("title: Début", "# Début\n"),
    });
    expect(findings.map(({ code, location }) => [code, location])).toEqual([
      ["translation/unsupported-locale", "README.fr.md"],
      ["translation/unsupported-locale", "docs/fr/"],
    ]);
  });

  it("errors on a translated reference or changelog area", async () => {
    const findings = await check({
      "docs/reference/index.md": "---\ntitle: Reference\n---\n\n# Reference\n",
      "docs/pt-BR/reference/index.md": translatedDocument("title: Referência", "# Referência\n"),
      "docs/pt-BR/changelog/1.0.0.md": translatedDocument("title: 1.0.0", "# 1.0.0\n"),
    });
    expect(findings.map(({ code, location }) => [code, location])).toEqual([
      ["translation/untranslatable-area", "docs/pt-BR/changelog/"],
      ["translation/untranslatable-area", "docs/pt-BR/reference/"],
    ]);
  });

  it("errors on a translated internal area, which is never published", async () => {
    const findings = await check({
      "docs/internal/notes.md": "# Notes\n",
      "docs/pt-BR/internal/notes.md": translatedDocument("title: Notas", "# Notas\n"),
    });
    expect(findings.map(({ code, location, severity }) => [code, location, severity])).toEqual([
      ["translation/untranslatable-area", "docs/pt-BR/internal/", "error"],
    ]);
  });

  it("errors on a source that is missing or is not a blob ID", async () => {
    const findings = await check({
      "README.es.md": "# @codenhub/example\n",
      "docs/es/index.md": translatedDocument("title: Ejemplo\nsource: HEAD", "# Ejemplo\n"),
    });
    expect(findings.map(({ code, location }) => [code, location])).toEqual([
      ["translation/invalid-source", "README.es.md"],
      ["translation/invalid-source", "docs/es/index.md"],
    ]);
  });

  it("errors when a translation changes the English order or curation", async () => {
    const findings = await check({
      "docs/es/start.md": translatedDocument(`title: Inicio\norder: 2\nsource: ${blobId(START)}`, "# Inicio\n"),
    });
    expect(findings).toEqual([
      expect.objectContaining({ code: "translation/structure-mismatch", location: "docs/es/start.md" }),
    ]);
    expect(findings[0]?.message).toContain("order is 2 here but 1");
  });

  it("warns about a link to an English page that has a translation in the same locale", async () => {
    const findings = await check({
      "docs/pt-BR/index.md": translatedDocument(
        `title: Exemplo\nsource: ${blobId(INDEX)}`,
        "# Exemplo\n\n[Início](../start.md)\n",
      ),
      "docs/pt-BR/start.md": translatedDocument(`title: Início\norder: 1\nsource: ${blobId(START)}`, "# Início\n"),
    });
    expect(findings).toEqual([
      expect.objectContaining({
        code: "translation/english-link",
        location: "docs/pt-BR/index.md",
        severity: "warning",
      }),
    ]);
  });

  it("accepts a link to an English page that has no translation in that locale", async () => {
    const findings = await check({
      "docs/pt-BR/index.md": translatedDocument(
        `title: Exemplo\nsource: ${blobId(INDEX)}`,
        "# Exemplo\n\n[Start](../start.md)\n",
      ),
      "docs/es/start.md": translatedDocument(`title: Inicio\norder: 1\nsource: ${blobId(START)}`, "# Inicio\n"),
    });
    expect(findings).toEqual([]);
  });
});
