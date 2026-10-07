import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

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
 * A block that imports a library other than this package, as the integrations page does. The suite does
 * not install those libraries, so such a block is checked against the version its page names, outside
 * the suite, and not here.
 */
const OTHER_LIBRARY = /^import\b[^;]*?\bfrom "(?!@codenhub\/validation")[^"]+";/m;

/**
 * Every TypeScript block of the public pages, each a module of its own, but one that imports another
 * library. A block that imports nothing, such as a list of calls written under the import of the block
 * before it, is given an import of every export.
 */
function examples(exportNames: readonly string[]): Example[] {
  return pages.flatMap((page) => {
    const text = readFileSync(`${packageRoot}${page}`, "utf8");
    const blocks = [...text.matchAll(/```ts\n([\s\S]*?)```/g)].filter(
      (match) => !OTHER_LIBRARY.test(match[1] as string),
    );
    return blocks.map((match) => {
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

  it("run against the built package, and give the results their comments show", async () => {
    expect(existsSync(declarations), "run `pnpm build validation` first: this test reads dist/").toBe(true);
    const module = (await import(`${packageRoot}dist/index.js`)) as Record<string, unknown>;
    const exportNames = Object.keys(module);
    const failures: string[] = [];
    let checked = 0;
    for (const example of examples(exportNames)) {
      const annotated: { line: number; comment: string }[] = [];
      // A line written as `expression; // { ok: true, value: … }` states what the expression gives. It is
      // wrapped so the test receives what it gave, and every other line runs as written.
      const body = example.code
        .split("\n")
        .map((line, index) => {
          const found = ANNOTATED_LINE.exec(line);
          if (found === null || /^(?:const|let|return|await|export|import)\b/.test(found[2] as string)) {
            return line;
          }
          annotated.push({ line: example.lines[index] ?? -1, comment: found[3] as string });
          return `${found[1]}await __check(${annotated.length - 1}, () => (${found[2]}));`;
        })
        .join("\n");
      if (annotated.length === 0) {
        continue;
      }
      const results = new Map<number, unknown>();
      const javascript = ts
        .transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
        .outputText.replace(/^import .*$/gm, "")
        .replace(/^export \{\};?$/gm, "")
        // An example may export what it declares, as a module of an app would; here it is only declared.
        .replace(/^export (?=(?:const|let|function|class|async)\b)/gm, "");
      try {
        // In a block of its own, so an example may declare a name an export has, as `const port = …` does.
        const run = new AsyncFunction("__check", ...exportNames, ...STUB_NAMES, `{\n${javascript}\n}`) as (
          ...args: unknown[]
        ) => Promise<void>;
        // One example at a time, in order, so a failure names the example that caused it.
        // oxlint-disable-next-line no-await-in-loop -- the examples run one after another on purpose
        await run(
          async (index: number, evaluate: () => unknown) => {
            results.set(index, await evaluate());
          },
          ...exportNames.map((name) => module[name]),
          ...STUB_NAMES.map((name) => STUBS[name]),
        );
      } catch (error) {
        failures.push(`${example.where}: threw ${String(error)}`);
      }
      for (const [index, { line, comment }] of annotated.entries()) {
        checked += 1;
        const where = `${example.where.split(":")[0]}:${line}`;
        if (!results.has(index)) {
          failures.push(`${where}: never ran`);
          continue;
        }
        const problem = compare(results.get(index), comment);
        if (problem !== undefined) {
          failures.push(`${where}: ${problem}`);
        }
      }
    }
    expect(failures).toEqual([]);
    // So a change to how lines are recognized cannot quietly check none of them.
    expect(checked).toBeGreaterThan(25);
  });
});

/** A line of code that ends with a comment stating its result, the expression and the comment captured. */
const ANNOTATED_LINE = /^(\s*)(.+?);\s*\/\/\s*(\{ ok: (?:true|false)\b.*|ok|fails\b.*|".*")$/;

const AsyncFunction = (async () => undefined).constructor as new (...args: string[]) => unknown;

/** What the fragments take from the text around them, as `context` declares it for the types. */
const STUBS: Record<string, unknown> = {
  // The examples that read `input` show what an invalid one gives, such as "Invalid email address".
  input: "not an email",
  requestBody: undefined,
  save: () => undefined,
  t: (key: string) => key,
  isTaken: async () => false,
  findUser: async () => undefined,
};
const STUB_NAMES = Object.keys(STUBS);

/**
 * Compares a result with the comment that states it: `{ ok: true, value: … }` with that value when it is
 * written out, `{ ok: false, … }` with a failure and, when it names one, the code of its first issue,
 * `ok` and `fails` with either, and quoted text with the text the expression gave.
 */
function compare(actual: unknown, comment: string): string | undefined {
  if (comment.startsWith('"')) {
    const text = JSON.parse(comment) as string;
    return actual === text ? undefined : `gave ${JSON.stringify(actual)}, the comment says ${comment}`;
  }
  const result = actual as { ok?: unknown; value?: unknown; error?: { issues?: { code?: string }[] } };
  const isOk = comment === "ok" || comment.startsWith("{ ok: true");
  if (result.ok !== isOk) {
    return `gave ${JSON.stringify(result)}, the comment says ${comment}`;
  }
  const value = /^\{ ok: true, value: (.*) \}$/.exec(comment)?.[1];
  if (value !== undefined && !value.includes("...")) {
    // The comment is a TypeScript literal, so it is read as one.
    const expected: unknown = new Function(`return (${value});`)();
    if (!isDeepStrictEqual(result.value, expected)) {
      return `gave ${JSON.stringify(result.value)}, the comment says ${value}`;
    }
  }
  const code = /code "([^"]+)"/.exec(comment)?.[1];
  if (code !== undefined && result.error?.issues?.[0]?.code !== code) {
    return `gave code ${String(result.error?.issues?.[0]?.code)}, the comment says ${code}`;
  }
  return undefined;
}
