import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readTranslationDrift } from "../documentation/translations.ts";
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

async function createPackage(files: Record<string, string>, status = "experimental"): Promise<WorkspacePackage> {
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
    manifest: {
      codenhub: { docs: {}, label: "Example", status },
      name: "@codenhub/example",
    },
    name: "@codenhub/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

async function check(files: Record<string, string>, status?: string): Promise<Finding[]> {
  const [rule] = createTranslationRules();
  return rule!.run({
    includePack: false,
    package: await createPackage(files, status),
  });
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

  it("accepts an active package translated into every listed locale", async () => {
    const locales = [
      ["pt-BR", "Exemplo", "Início"],
      ["es", "Ejemplo", "Inicio"],
    ] as const;
    const files = Object.fromEntries(
      locales.flatMap(([locale, index, start]) => [
        [
          `README.${locale}.md`,
          `<!-- source: ${blobId(README)} -->\n\n# @codenhub/example\n\n[Docs](docs/${locale}/index.md)\n`,
        ],
        [
          `docs/${locale}/index.md`,
          translatedDocument(`title: ${index}\nsource: ${blobId(INDEX)}`, `# ${index}\n\n[${start}](./start.md)\n`),
        ],
        [
          `docs/${locale}/start.md`,
          translatedDocument(`title: ${start}\norder: 1\nsource: ${blobId(START)}`, `# ${start}\n`),
        ],
      ]),
    );

    expect(await check(files, "active")).toEqual([]);
  });

  it("errors on each README and public document an active package has not translated", async () => {
    const findings = await check(
      {
        "docs/pt-BR/start.md": translatedDocument(`title: Início\norder: 1\nsource: ${blobId(START)}`, "# Início\n"),
      },
      "active",
    );

    expect(
      findings.filter(({ code }) => code === "translation/missing").map(({ location, message }) => [location, message]),
    ).toEqual([
      ["README.md", expect.stringContaining("No pt-BR translation at README.pt-BR.md;")],
      ["README.md", expect.stringContaining("No es translation at README.es.md;")],
      ["docs/index.md", expect.stringContaining("No pt-BR translation at docs/pt-BR/index.md;")],
      ["docs/index.md", expect.stringContaining("No es translation at docs/es/index.md;")],
      ["docs/start.md", expect.stringContaining("No es translation at docs/es/start.md;")],
    ]);
    expect(findings.find(({ code }) => code === "translation/missing")?.severity).toBe("error");
  });

  it("does not ask an active package to translate areas that are never translated", async () => {
    const findings = await check(
      {
        "docs/changelog/1.0.0.md": "# 1.0.0\n",
        "docs/internal/notes.md": "# Notes\n",
        "docs/plans/next.md": "# Next\n",
        "docs/reference/index.md": "# Reference\n",
        "docs/logo.svg": "<svg/>",
      },
      "active",
    );

    expect(findings.filter(({ code }) => code === "translation/missing").map(({ location }) => location)).toEqual([
      "README.md",
      "README.md",
      "docs/index.md",
      "docs/index.md",
      "docs/start.md",
      "docs/start.md",
    ]);
  });

  it("does not ask an experimental package for missing translations", async () => {
    expect((await check({})).map(({ code }) => code)).not.toContain("translation/missing");
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

  it("errors on a localized asset with no English counterpart, and accepts one that replaces the English", async () => {
    const findings = await check({
      "docs/diagram.svg": "<svg/>\n",
      "docs/pt-BR/diagram.svg": "<svg/>\n",
      "docs/pt-BR/extra.svg": "<svg/>\n",
    });
    expect(findings.map(({ code, location }) => [code, location])).toEqual([
      ["translation/missing-english", "docs/pt-BR/extra.svg"],
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

  it("errors when a translation's headings differ in number or level from the English", async () => {
    const english = "---\ntitle: Start\norder: 1\n---\n\n# Start\n\n## Install\n\n### From npm\n\n## Use\n";
    const fields = `title: Inicio\norder: 1\nsource: ${blobId(english)}`;
    const findings = await check({
      "docs/start.md": english,
      "docs/es/start.md": translatedDocument(fields, "# Inicio\n\n## Instalar\n\n## Desde npm\n\n## Usar\n"),
      "docs/pt-BR/start.md": translatedDocument(
        fields,
        "# Início\n\n## Instalar\n\n### Pelo npm\n\n## Usar\n\n```md\n## Not a heading\n```\n",
      ),
    });
    expect(findings).toEqual([
      expect.objectContaining({ code: "translation/structure-mismatch", location: "docs/es/start.md" }),
    ]);
    expect(findings[0]?.message).toContain("heading 3 is an H2 here but an H3");
  });

  it("errors when a translation has fewer headings than the English", async () => {
    const english = "---\ntitle: Start\norder: 1\n---\n\n# Start\n\n## Install\n\n## Use\n";
    const findings = await check({
      "docs/start.md": english,
      "docs/es/start.md": translatedDocument(
        `title: Inicio\norder: 1\nsource: ${blobId(english)}`,
        "# Inicio\n\n## Instalar\n",
      ),
    });
    expect(findings).toEqual([
      expect.objectContaining({ code: "translation/structure-mismatch", location: "docs/es/start.md" }),
    ]);
    expect(findings[0]?.message).toContain("2 headings here but 3");
  });

  it("errors when a translation has more headings than the English", async () => {
    const english = "---\ntitle: Start\norder: 1\n---\n\n# Start\n\n## Install\n\n## Use\n";
    const findings = await check({
      "docs/start.md": english,
      "docs/es/start.md": translatedDocument(
        `title: Inicio\norder: 1\nsource: ${blobId(english)}`,
        "# Inicio\n\n## Instalar\n\n## Usar\n\n## Extra\n",
      ),
    });
    expect(findings).toEqual([
      expect.objectContaining({ code: "translation/structure-mismatch", location: "docs/es/start.md" }),
    ]);
    expect(findings[0]?.message).toContain("4 headings here but 3");
  });

  it("only warns about headings a stale translation has not caught up with", async () => {
    const before = "---\ntitle: Start\norder: 1\n---\n\n# Start\n\n## Install\n";
    const findings = await check({
      "docs/start.md": `${before}\n## Use\n`,
      "docs/es/start.md": translatedDocument(
        `title: Inicio\norder: 1\nsource: ${blobId(before)}`,
        "# Inicio\n\n## Instalar\n",
      ),
    });
    expect(findings.map(({ code, severity }) => [code, severity])).toEqual([
      ["translation/structure-mismatch", "warning"],
      ["translation/stale", "warning"],
    ]);
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

  it("reports a translation with no English counterpart or in an unlisted locale as unverifiable in readTranslationDrift", async () => {
    const workspacePackage = await createPackage({
      "docs/es/deleted.md": translatedDocument(`title: Removido\nsource: ${"a".repeat(40)}`, "# Removido\n"),
      "docs/fr/index.md": translatedDocument(`title: Exemple\nsource: ${blobId(INDEX)}`, "# Exemple\n"),
      "docs/pt-BR/reference/index.md": translatedDocument(
        `title: Referência\nsource: ${"b".repeat(40)}`,
        "# Referência\n",
      ),
    });

    const drift = await readTranslationDrift(workspacePackage.directory);
    expect(drift).toEqual({
      stale: [],
      translationCount: 3,
      unsourced: ["docs/es/deleted.md", "docs/fr/index.md", "docs/pt-BR/reference/index.md"],
    });
  });
});
