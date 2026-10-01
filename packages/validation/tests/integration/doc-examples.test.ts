import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// With forward slashes, as TypeScript names files on every platform, so the virtual files are found by name.
const packageRoot = fileURLToPath(new URL("../../", import.meta.url)).replaceAll("\\", "/");
const declarations = `${packageRoot}dist/index.d.ts`;
const virtualRoot = `${packageRoot}tests/integration/doc-examples/`;

// A TypeScript program over the built declarations takes seconds, as in consumer-types.test.ts.
const COMPILE_TIMEOUT = 60_000;

/** The public pages: the README and the pages under docs/, not the internal notes, changelog or reference. */
const pages = [
  "README.md",
  ...readdirSync(`${packageRoot}docs`)
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/${name}`),
];

/**
 * What the fragments in the docs take from the text around them, such as the input being validated or
 * the validator written in an earlier example. A block that declares one of these itself uses its own,
 * since a module's declarations shadow global ones.
 */
const context = `import type { ValidationIssue, Validator } from "@codenhub/validation";

declare global {
  interface User {
    id: string;
  }
  const input: unknown;
  const requestBody: unknown;
  const issue: ValidationIssue;
  const even: Validator<number>;
  const signup: Validator<{ name: string; email: string }>;
  function save(value: string): void;
  function t(key: string): string;
  function isTaken(name: string): Promise<boolean>;
  function findUser(id: string): Promise<User | undefined>;
}

export {};
`;

interface Example {
  /** Where the block starts, as `page:line`, for the failure message. */
  where: string;
  /** The line of the page each line of `code` came from, or -1 for a line the test added. */
  lines: number[];
  code: string;
}

/**
 * Every TypeScript block of the public pages, each a module of its own. A block that imports nothing,
 * such as a list of calls written under the import of the block before it, is given an import of every
 * export.
 */
function examples(exportNames: readonly string[]): Example[] {
  return pages.flatMap((page) => {
    const text = readFileSync(`${packageRoot}${page}`, "utf8");
    return [...text.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => {
      const firstLine = text.slice(0, match.index).split("\n").length + 1;
      const body = match[1] as string;
      const header = /^import /m.test(body)
        ? []
        : [`import { ${exportNames.join(", ")} } from "@codenhub/validation";`];
      const code = [...header, body, "export {};"].join("\n");
      const lines = [...header.map(() => -1), ...body.split("\n").map((_, index) => firstLine + index)];
      return { where: `${page}:${firstLine}`, lines, code };
    });
  });
}

describe("documentation examples", () => {
  it(
    "type-check against the built declarations, as a consumer writes them",
    async () => {
      expect(existsSync(declarations), "run `pnpm build validation` first: this test reads dist/").toBe(true);

      const exportNames = Object.keys(await import(`${packageRoot}dist/index.js`));
      const files = new Map<string, Example | undefined>([[`${virtualRoot}context.d.ts`, undefined]]);
      for (const [index, example] of examples(exportNames).entries()) {
        files.set(`${virtualRoot}example-${index}.ts`, example);
      }
      const contents = (fileName: string): string | undefined =>
        files.has(fileName) ? (files.get(fileName)?.code ?? context) : undefined;

      const options: ts.CompilerOptions = {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        types: [],
        paths: { "@codenhub/validation": [declarations] },
      };
      const host = ts.createCompilerHost(options);
      const { fileExists, readFile, getSourceFile } = host;
      host.fileExists = (fileName) => files.has(fileName) || fileExists(fileName);
      host.readFile = (fileName) => contents(fileName) ?? readFile(fileName);
      host.getSourceFile = (fileName, language, ...rest) => {
        const code = contents(fileName);
        return code === undefined
          ? getSourceFile(fileName, language, ...rest)
          : ts.createSourceFile(fileName, code, language, true);
      };

      const program = ts.createProgram([...files.keys()], options, host);
      const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        const example = diagnostic.file === undefined ? undefined : files.get(diagnostic.file.fileName);
        if (example === undefined || diagnostic.file === undefined || diagnostic.start === undefined) {
          return message;
        }
        const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        const pageLine = example.lines[line] ?? -1;
        return `${example.where} (line ${pageLine === -1 ? "added by the test" : pageLine}): ${message}`;
      });

      expect(diagnostics).toEqual([]);
    },
    COMPILE_TIMEOUT,
  );
});
