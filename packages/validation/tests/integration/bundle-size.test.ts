import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "tsdown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The package's promise is that a consumer ships only the validators it uses. Each scenario below is
 * a small consumer module bundled against the built `dist/` and minified, and its gzipped size must
 * stay under a budget. A budget that fails means something made every validator heavier: a shared
 * helper grew, or a module gained a side effect and stopped tree-shaking.
 *
 * Budgets sit a little above what each scenario measures, so ordinary changes pass and a regression
 * does not. Raise one only on purpose, and say why in the change.
 */
const distEntry = fileURLToPath(new URL("../../dist/index.js", import.meta.url));

interface Scenario {
  name: string;
  /** Exports the consumer imports and uses. */
  source: string;
  /** Ceiling for the minified, gzipped bundle, in bytes. */
  budget: number;
}

const scenarios: Scenario[] = [
  { name: "boolean", source: `import { boolean } from "DIST"; export const check = boolean();`, budget: 560 },
  {
    name: "number",
    source: `import { number } from "DIST"; export const check = number({ int: true, min: 0 });`,
    budget: 1150,
  },
  {
    name: "string",
    source: `import { string } from "DIST"; export const check = string({ min: 2, trim: true });`,
    budget: 1200,
  },
  { name: "email", source: `import { email } from "DIST"; export const check = email();`, budget: 800 },
  {
    name: "object of three fields",
    source: `import { email, number, object, optional, string } from "DIST";
export const check = object({ name: string({ min: 2 }), email: email(), age: optional(number({ int: true })) });`,
    budget: 2450,
  },
  {
    name: "object of three fields with messages",
    source: `import { email, formatIssue, number, object, optional, string } from "DIST";
export const check = object({ name: string({ min: 2 }), email: email(), age: optional(number({ int: true })) });
export const describe = (input: unknown) => { const result = check(input); return result.ok ? [] : result.error.issues.map((issue) => formatIssue(issue)); };`,
    budget: 3250,
  },
  { name: "uuid", source: `import { uuid } from "DIST"; export const check = uuid();`, budget: 680 },
  { name: "url", source: `import { url } from "DIST"; export const check = url({ allowLocal: true });`, budget: 820 },
  { name: "ip", source: `import { ip } from "DIST"; export const check = ip();`, budget: 900 },
  {
    name: "datetime",
    source: `import { datetime } from "DIST"; export const check = datetime({ offset: true });`,
    budget: 970,
  },
  {
    name: "date",
    source: `import { date } from "DIST"; export const check = date({ min: new Date(0) });`,
    budget: 770,
  },
  {
    name: "oneOf",
    source: `import { oneOf } from "DIST"; export const check = oneOf(["admin", "user"]);`,
    budget: 340,
  },
  {
    name: "messages only",
    source: `import { formatIssue } from "DIST"; export const describe = formatIssue;`,
    budget: 1180,
  },
  {
    name: "everything",
    source: `export * from "DIST";`,
    budget: 5400,
  },
];

const workspace = mkdtempSync(join(tmpdir(), "validation-size-"));

/** Bundles a scenario the way a consumer's build would and returns the gzipped size of the output. */
const measure = async ({ name, source }: Scenario): Promise<number> => {
  const slug = name.replaceAll(/\W+/g, "-");
  const entry = join(workspace, `${slug}.ts`);
  const outDir = join(workspace, `out-${slug}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(entry, source.replaceAll("DIST", distEntry));
  await build({
    config: false,
    entry: [entry],
    outDir,
    format: "esm",
    platform: "neutral",
    minify: true,
    dts: false,
    clean: false,
    logLevel: "silent",
  });
  const [file] = readdirSync(outDir).filter((candidate) => candidate.endsWith(".js"));
  return gzipSync(readFileSync(join(outDir, file as string)), { level: 9 }).length;
};

describe("bundle size", () => {
  beforeAll(() => {
    if (!existsSync(distEntry)) {
      throw new Error("run `pnpm build validation` first: this test reads dist/");
    }
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it.each(scenarios)("$name stays under $budget bytes gzipped", async (scenario) => {
    expect(await measure(scenario)).toBeLessThanOrEqual(scenario.budget);
  });

  it("bundles a single validator into far less than the whole package", async () => {
    const [everything, single] = await Promise.all([
      measure(scenarios.find((scenario) => scenario.name === "everything") as Scenario),
      measure(scenarios.find((scenario) => scenario.name === "email") as Scenario),
    ]);
    expect(single).toBeLessThan(everything / 3);
  });
});
