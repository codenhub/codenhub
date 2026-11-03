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
 * A block of the integrations page that imports a library other than this package. The suite does not
 * install those libraries, so such a block is checked against the version the page names, outside the
 * suite, and not here. A block of another page that imports one, such as `vitest`, which the suite runs
 * on, is checked as any other.
 */
const OTHER_LIBRARY = /^import\b[^;]*?\bfrom "(?!@codenhub\/validation")[^"]+";/m;
const INTEGRATIONS = "docs/integrations.md";

/**
 * Every TypeScript block of the public pages, each a module of its own. The one exception is a block of
 * the integrations page that imports another library, which is left out. A block that imports nothing, such as a list of calls written under the import of the block
 * before it, is given an import of every export.
 */
function examples(exportNames: readonly string[]): Example[] {
  return pages.flatMap((page) => {
    const text = readFileSync(`${packageRoot}${page}`, "utf8");
    const blocks = [...text.matchAll(/```ts\n([\s\S]*?)```/g)].filter(
      (match) => page !== INTEGRATIONS || !OTHER_LIBRARY.test(match[1] as string),
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
      // A line whose comment states what its expression gives, as the grammar above `annotation` says, is
      // wrapped so the test receives what it gave, and every other line runs as written.
      const codeLines = example.code.split("\n");
      const body = codeLines
        .map((line, index) => {
          const found = annotation(codeLines, index);
          if (found === undefined) {
            return line;
          }
          annotated.push({ line: example.lines[index] ?? -1, comment: found.comment });
          return `${found.indent}${found.declaration}await __check(${annotated.length - 1}, () => (${found.expression}));`;
        })
        .join("\n");
      if (annotated.length === 0 || readsUnstubbed(example.code)) {
        continue;
      }
      const results = new Map<number, Outcome>();
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
          // A line that throws is recorded and the example goes on, so the lines after it are checked too.
          async (index: number, evaluate: () => unknown) => {
            try {
              const value = await evaluate();
              results.set(index, { value });
              return value;
            } catch (error) {
              results.set(index, { error });
              return undefined;
            }
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
        const problem = compare(results.get(index) as Outcome, comment);
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

/*
 * The comments the test checks, each written after an expression statement, on its line or, alone, on the
 * line after it. The statement may also be a `const` or `let` declaration, whose initializer is checked.
 *
 *   { ok: true, value: V } | { ok: false, … } | ok | fails …   a validator's result, as `compare` says
 *   { … } | [ … ]   a literal the result equals, which on the lines after the statement may run over
 *                   several, each starting with `//`, until its brackets close; `...` stands for any
 *                   other properties of an object, or any further items at the end of an array
 *   "text"          the text the expression gives
 *   TypeError: m    an error the expression throws, as `String(error)` writes it
 *
 * Any other comment, such as prose under the result, is not checked, and neither is a `{ … }` or `[ … ]`
 * after a declaration, which writes the type it declares. A block that reads a value of `context` with no
 * stub, such as `signup`, is not run.
 */
const COMMENT = /^(\{.*|\[.*|ok|fails\b.*|".*"|[A-Z]\w*Error: .*)$/;
/** A statement that ends on its line and is not one the test can wrap, such as a `return` or a type. */
const STATEMENT = /^(\s*)((?:const|let)\s+[^=]+?=\s*)?(?!(?:return|await|export|import|type|interface)\b)(.+?);$/;
const SAME_LINE = /^(.+?;)\s*\/\/\s*(.*)$/;
const COMMENT_LINE = /^\s*\/\/\s?(.*)$/;

interface Annotation {
  indent: string;
  /** `const name = ` for a declaration, so the line still declares it. */
  declaration: string;
  expression: string;
  comment: string;
}

/** The annotation of `lines[index]`, read as the grammar above says, or `undefined` when it has none. */
function annotation(lines: readonly string[], index: number): Annotation | undefined {
  const line = lines[index] as string;
  const sameLine = SAME_LINE.exec(line);
  let statement: string;
  let comment: string;
  if (sameLine === null) {
    const next = COMMENT_LINE.exec(lines[index + 1] ?? "");
    // A statement whole on its line, so the line that ends a longer one, as `});` does, is not read.
    if (next === null || COMMENT_LINE.test(line) || !balanced(line)) {
      return undefined;
    }
    statement = line;
    comment = (next[1] as string).trim();
    // A literal runs over the comment lines after it until its brackets close.
    for (let more = index + 2; /^[{[]/.test(comment) && !balanced(comment); more += 1) {
      const following = COMMENT_LINE.exec(lines[more] ?? "");
      if (following === null) {
        break;
      }
      comment = `${comment} ${(following[1] as string).trim()}`;
    }
  } else {
    statement = sameLine[1] as string;
    comment = (sameLine[2] as string).trim();
  }
  const parts = STATEMENT.exec(statement);
  if (parts === null || !COMMENT.test(comment)) {
    return undefined;
  }
  // The literal after a declaration writes the type it declares, as `const point = tuple(…); // [number, number]`.
  if (parts[2] !== undefined && /^[{[]/.test(comment) && !comment.startsWith("{ ok: ")) {
    return undefined;
  }
  return {
    indent: parts[1] as string,
    declaration: parts[2] ?? "",
    expression: parts[3] as string,
    comment,
  };
}

/** Whether the brackets of `code` close, outside its strings. */
function balanced(code: string): boolean {
  let depth = 0;
  for (const character of code.replaceAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`/g, "")) {
    if ("([{".includes(character)) {
      depth += 1;
    } else if (")]}".includes(character)) {
      depth -= 1;
    }
  }
  return depth === 0;
}

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
/** The values `context` declares that have no stub, which a block that reads them cannot run without. */
const UNSTUBBED = [...context.matchAll(/^\s*(?:const|function) (\w+)/gm)]
  .map((match) => match[1] as string)
  .filter((name) => !STUB_NAMES.includes(name));

/** Whether `code` reads a value of `context` that has no stub, and does not declare it itself. */
function readsUnstubbed(source: string): boolean {
  // Without comments and strings, which may name one, as "one issue" does.
  const code = source.replaceAll(/\/\/.*$|"(?:[^"\\\n]|\\.)*"|`[^`]*`/gm, "");
  return UNSTUBBED.some(
    (name) =>
      new RegExp(`\\b${name}\\b`).test(code) && !new RegExp(`\\b(?:const|let|function|class) ${name}\\b`).test(code),
  );
}

/** What an annotated expression gave: its value, or the error it threw. */
type Outcome = { value: unknown } | { error: unknown };

/** Stands for the `...` of a literal: a key of an object, or the last item of an array. */
const REST = Symbol("...");
const rest = Object.defineProperty({ [REST]: true }, Symbol.iterator, {
  enumerable: false,
  *value() {
    yield REST;
  },
});

/** The value a literal comment writes, read as TypeScript would, with each `...` read as `REST`. */
function literal(text: string): unknown {
  return new Function("__rest", `return (${text.replaceAll(/\.\.\.(?![\w$])/g, "...__rest")});`)(rest);
}

/**
 * Whether `actual` is what `expected` writes: the same primitives, arrays of the same items and plain
 * objects of the same keys and values, whatever the prototype of the actual one. `REST` lets an object
 * have other keys, and an array other items after the ones written.
 */
function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    const open = expected.at(-1) === REST;
    const items = open ? expected.slice(0, -1) : expected;
    return (
      Array.isArray(actual) &&
      (open ? actual.length >= items.length : actual.length === items.length) &&
      items.every((item, index) => matches(actual[index], item))
    );
  }
  if (typeof expected === "object" && expected !== null && Object.getPrototypeOf(expected) === Object.prototype) {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) {
      return false;
    }
    const prototype: unknown = Object.getPrototypeOf(actual);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const written = expected as Record<string, unknown>;
    const record = actual as Record<string, unknown>;
    const keys = Object.keys(written);
    return (
      (REST in written || Object.keys(record).length === keys.length) &&
      keys.every((key) => Object.hasOwn(record, key) && matches(record[key], written[key]))
    );
  }
  return isDeepStrictEqual(actual, expected);
}

/** `value` as a failure message writes it, with `undefined` written out. */
function show(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) => (item === undefined ? "undefined" : item)) ?? String(value);
}

/**
 * Compares what an expression gave with the comment that states it, as the grammar above `annotation`
 * says. For a validator's result: `{ ok: true, value: … }` with that value when it is written out,
 * `{ ok: false, … }` with a failure and, when it names one, the code of its first issue, and `ok` and
 * `fails` with either.
 */
function compare(outcome: Outcome, comment: string): string | undefined {
  if (/^[A-Z]\w*Error: /.test(comment)) {
    if (!("error" in outcome)) {
      return `gave ${show(outcome.value)}, the comment says it throws ${comment}`;
    }
    return String(outcome.error) === comment
      ? undefined
      : `threw ${String(outcome.error)}, the comment says ${comment}`;
  }
  if ("error" in outcome) {
    return `threw ${String(outcome.error)}, the comment says ${comment}`;
  }
  const actual = outcome.value;
  if (comment.startsWith('"')) {
    const text = JSON.parse(comment) as string;
    return actual === text ? undefined : `gave ${show(actual)}, the comment says ${comment}`;
  }
  if (!/^(?:ok$|fails\b|\{ ok: )/.test(comment)) {
    let expected: unknown;
    try {
      expected = literal(comment);
    } catch {
      return `the comment is not a literal: ${comment}`;
    }
    return matches(actual, expected) ? undefined : `gave ${show(actual)}, the comment says ${comment}`;
  }
  const result = actual as { ok?: unknown; value?: unknown; error?: { issues?: { code?: string }[] } };
  const isOk = comment === "ok" || comment.startsWith("{ ok: true");
  if (result.ok !== isOk) {
    return `gave ${show(result)}, the comment says ${comment}`;
  }
  const value = /^\{ ok: true, value: (.*) \}$/.exec(comment)?.[1];
  if (value !== undefined && !matches(result.value, literal(value))) {
    return `gave ${show(result.value)}, the comment says ${value}`;
  }
  const code = /code "([^"]+)"/.exec(comment)?.[1];
  if (code !== undefined && result.error?.issues?.[0]?.code !== code) {
    return `gave code ${String(result.error?.issues?.[0]?.code)}, the comment says ${code}`;
  }
  return undefined;
}
