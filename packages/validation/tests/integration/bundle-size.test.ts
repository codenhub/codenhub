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
    name: "array",
    source: `import { array, string } from "DIST"; export const check = array(string(), { max: 5 });`,
    budget: 1750,
  },
  {
    name: "set",
    source: `import { number, set } from "DIST"; export const check = set(number());`,
    budget: 1650,
  },
  {
    name: "map",
    source: `import { map, number, string } from "DIST"; export const check = map(string(), number());`,
    budget: 2200,
  },
  {
    name: "tuple",
    source: `import { number, tuple } from "DIST"; export const check = tuple([number(), number()]);`,
    budget: 1480,
  },
  {
    name: "record",
    source: `import { number, record, string } from "DIST"; export const check = record(string(), number());`,
    budget: 2050,
  },
  {
    name: "union",
    source: `import { literal, union } from "DIST"; export const check = union([literal("a"), literal("b")]);`,
    budget: 480,
  },
  {
    name: "discriminatedUnion",
    source: `import { discriminatedUnion, object, string } from "DIST";
export const check = discriminatedUnion("type", { a: object({ a: string() }), b: object({ b: string() }) });`,
    budget: 1780,
  },
  { name: "json", source: `import { json } from "DIST"; export const check = json();`, budget: 620 },
  {
    name: "coerceNumber",
    source: `import { coerceNumber } from "DIST"; export const check = coerceNumber({ int: true });`,
    budget: 1280,
  },
  {
    name: "coerceString",
    source: `import { coerceString } from "DIST"; export const check = coerceString();`,
    budget: 1270,
  },
  {
    name: "coerceBoolean",
    source: `import { coerceBoolean } from "DIST"; export const check = coerceBoolean();`,
    budget: 730,
  },
  {
    name: "coerceBigint",
    source: `import { coerceBigint } from "DIST"; export const check = coerceBigint();`,
    budget: 870,
  },
  { name: "coerceDate", source: `import { coerceDate } from "DIST"; export const check = coerceDate();`, budget: 1060 },
  {
    name: "standard",
    source: `import { number, standard } from "DIST"; export const check = standard(number());`,
    budget: 2380,
  },
  {
    name: "messages only",
    source: `import { formatIssue } from "DIST"; export const describe = formatIssue;`,
    budget: 1180,
  },
  {
    name: "everything",
    source: `export * from "DIST";`,
    budget: 6950,
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

// Each scenario runs a real build, which is quick alone and slower under load or coverage.
describe("bundle size", { timeout: 30_000 }, () => {
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
