import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { Validator } from "../../dist/index";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const declarations = `${packageRoot}dist/index.d.ts`;
const fixture = `${packageRoot}tests/integration/fixtures/consumer.ts`;
const nodeFixtures = ["consumer-node.mts", "consumer-node.cts"].map(
  (name) => `${packageRoot}tests/integration/fixtures/${name}`,
);

// Creating a TypeScript program over the whole built declaration file takes a couple of seconds on
// an idle machine and more under load or coverage, so the default five seconds is not enough.
const COMPILE_TIMEOUT = 60_000;

describe("built declarations", () => {
  it(
    "type-check for a consumer, with the strictest settings and the library checked",
    () => {
      expect(existsSync(declarations), "run `pnpm build validation` first: this test reads dist/").toBe(true);

      const program = ts.createProgram([fixture], {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        skipLibCheck: false,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        types: [],
      });
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

      expect(diagnostics).toEqual([]);
    },
    COMPILE_TIMEOUT,
  );

  it(
    "type-check for an ES module and a CommonJS module resolving the package by name, as Node.js does",
    () => {
      expect(existsSync(declarations), "run `pnpm build validation` first: this test reads dist/").toBe(true);

      const program = ts.createProgram(nodeFixtures, {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        types: [],
      });
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

      expect(diagnostics).toEqual([]);
    },
    COMPILE_TIMEOUT,
  );
});

describe("built package", () => {
  it("loads with require, as the README promises for every supported Node.js version", () => {
    expect(existsSync(`${packageRoot}dist/index.js`), "run `pnpm build validation` first: this test reads dist/").toBe(
      true,
    );
    const required = createRequire(import.meta.url)("@codenhub/validation") as { string: () => Validator<string> };
    expect(required.string()("a")).toEqual({ ok: true, value: "a" });
  });
});
