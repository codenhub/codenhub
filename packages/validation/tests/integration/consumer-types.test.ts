import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const declarations = `${packageRoot}dist/index.d.ts`;
const fixture = `${packageRoot}tests/integration/fixtures/consumer.ts`;

describe("built declarations", () => {
  it("type-check for a consumer, with strict settings and no lib check", () => {
    expect(existsSync(declarations), "run `pnpm build validation` first: this test reads dist/").toBe(true);

    const program = ts.createProgram([fixture], {
      strict: true,
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
  });
});
