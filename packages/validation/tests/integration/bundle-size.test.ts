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
 * Each budget is what its scenario measured plus 10%, rounded up to ten bytes, so a fix that adds a
 * few bytes passes without touching this file, and a change that makes a validator a tenth heavier
 * fails. When one fails on purpose, measure every scenario again and reset all of them by the same rule,
 * saying in the change what grew and why.
 */
// Forward slashes, because the path is pasted into source code, where a Windows backslash is an escape.
const distEntry = fileURLToPath(new URL("../../dist/index.js", import.meta.url)).replaceAll("\\", "/");

interface Scenario {
  name: string;
  /** Exports the consumer imports and uses. */
  source: string;
  /** Ceiling for the minified, gzipped bundle, in bytes. */
  budget: number;
}

const scenarios: Scenario[] = [
  { name: "boolean", source: `import { boolean } from "DIST"; export const check = boolean();`, budget: 2020 },
  {
    name: "number",
    source: `import { number } from "DIST"; export const check = number({ int: true, min: 0 });`,
    budget: 2780,
  },
  {
    name: "string",
    source: `import { string } from "DIST"; export const check = string({ min: 2, trim: true });`,
    budget: 2480,
  },
  { name: "email", source: `import { email } from "DIST"; export const check = email();`, budget: 4230 },
  {
    name: "object of three fields",
    source: `import { email, number, object, optional, string } from "DIST";
export const check = object({ name: string({ min: 2 }), email: email(), age: optional(number({ int: true })) });`,
    budget: 7290,
  },
  {
    name: "object of three fields with messages",
    source: `import { email, englishMessages, formatIssue, number, object, optional, string } from "DIST";
export const check = object({ name: string({ min: 2 }), email: email(), age: optional(number({ int: true })) });
export const describe = (input: unknown) => { const result = check(input); return result.ok ? [] : result.error.issues.map((issue) => formatIssue(issue, englishMessages)); };`,
    budget: 9430,
  },
  { name: "uuid", source: `import { uuid } from "DIST"; export const check = uuid();`, budget: 2260 },
  { name: "url", source: `import { url } from "DIST"; export const check = url();`, budget: 6350 },
  { name: "ip", source: `import { ip } from "DIST"; export const check = ip();`, budget: 2690 },
  {
    name: "datetime",
    source: `import { datetime } from "DIST"; export const check = datetime({ offset: true });`,
    budget: 2460,
  },
  {
    name: "date",
    source: `import { date } from "DIST"; export const check = date({ min: new Date(0) });`,
    budget: 2320,
  },
  {
    name: "oneOf",
    source: `import { oneOf } from "DIST"; export const check = oneOf(["admin", "user"]);`,
    budget: 2160,
  },
  {
    name: "array",
    source: `import { array, string } from "DIST"; export const check = array(string(), { max: 5 });`,
    budget: 3850,
  },
  {
    name: "set",
    source: `import { number, set } from "DIST"; export const check = set(number());`,
    budget: 4260,
  },
  {
    name: "map",
    source: `import { map, number, string } from "DIST"; export const check = map(string(), number());`,
    budget: 4750,
  },
  {
    name: "tuple",
    source: `import { number, tuple } from "DIST"; export const check = tuple([number(), number()]);`,
    budget: 4220,
  },
  {
    name: "record",
    source: `import { number, record, string } from "DIST"; export const check = record(string(), number());`,
    budget: 4930,
  },
  {
    name: "union",
    source: `import { literal, union } from "DIST"; export const check = union([literal("a"), literal("b")]);`,
    budget: 2890,
  },
  {
    name: "tagged",
    source: `import { object, string, tagged } from "DIST";
export const check = tagged("type", { a: object({ a: string() }), b: object({ b: string() }) });`,
    budget: 4630,
  },
  { name: "json", source: `import { json } from "DIST"; export const check = json();`, budget: 2500 },
  {
    name: "coerceNumber",
    source: `import { coerceNumber } from "DIST"; export const check = coerceNumber({ int: true });`,
    budget: 3010,
  },
  {
    name: "coerceString",
    source: `import { coerceString } from "DIST"; export const check = coerceString();`,
    budget: 2620,
  },
  {
    name: "coerceBoolean",
    source: `import { coerceBoolean } from "DIST"; export const check = coerceBoolean();`,
    budget: 2240,
  },
  {
    name: "coerceBigint",
    source: `import { coerceBigint } from "DIST"; export const check = coerceBigint();`,
    budget: 2530,
  },
  { name: "coerceDate", source: `import { coerceDate } from "DIST"; export const check = coerceDate();`, budget: 2900 },
  {
    name: "standard",
    source: `import { englishMessages, number, standard } from "DIST"; export const check = standard(number(), englishMessages);`,
    budget: 5070,
  },
  {
    name: "standard with an object and no map",
    source: `import { object, standard, string } from "DIST"; export const check = standard(object({ name: string() }));`,
    budget: 6410,
  },
  {
    name: "formatIssue with your own wording",
    source: `import { formatIssue } from "DIST"; export const describe = (issue: Parameters<typeof formatIssue>[0]) => formatIssue(issue, { too_small: "Too short" });`,
    budget: 2620,
  },
  {
    name: "flatten with your own wording",
    source: `import { flatten } from "DIST"; export const group = (failure: Parameters<typeof flatten>[0]) => flatten(failure, { too_small: "Too short" });`,
    budget: 2710,
  },
  {
    name: "formatIssue with the English wording",
    source: `import { englishMessages, formatIssue } from "DIST"; export const describe = (issue: Parameters<typeof formatIssue>[0]) => formatIssue(issue, englishMessages);`,
    budget: 2610,
  },
  {
    name: "formatIssue with the Portuguese wording",
    source: `import { formatIssue, portugueseMessages } from "DIST"; export const describe = (issue: Parameters<typeof formatIssue>[0]) => formatIssue(issue, portugueseMessages);`,
    budget: 3770,
  },
  {
    name: "brand and readonly",
    source: `import { brand, readonly, string } from "DIST"; export const check = readonly(brand(string(), "Name"));`,
    budget: 2970,
  },
  {
    name: "assert with the wording of two codes",
    source: `import { assert, invalidTypeMessage, string, tooSmallMessage } from "DIST"; const messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage }; export const read = (input: unknown) => assert(string({ min: 1 }), input, { messages });`,
    budget: 3770,
  },
  {
    name: "objectLike",
    source: `import { boolean, objectLike, string } from "DIST"; export const check = objectLike({ a: string(), b: boolean() });`,
    budget: 3760,
  },
  {
    name: "toJsonSchema",
    source: `import { object, string, toJsonSchema } from "DIST"; export const schema = toJsonSchema(object({ name: string() }));`,
    budget: 6830,
  },
  {
    name: "pick",
    source: `import { object, pick, string } from "DIST"; export const check = pick(object({ name: string(), id: string() }), ["name"]);`,
    budget: 4590,
  },
  {
    name: "extend",
    source: `import { extend, object, string } from "DIST"; export const check = extend(object({ name: string() }), { id: string() });`,
    budget: 4440,
  },
  {
    name: "toJsonSchema with meta",
    source: `import { meta, object, string, toJsonSchema } from "DIST"; export const schema = toJsonSchema(object({ name: meta(string(), { description: "Name" }) }));`,
    budget: 7300,
  },
  {
    name: "audit",
    source: `import { array, audit, object, string } from "DIST"; export const findings = audit(object({ tags: array(string()) }));`,
    budget: 5720,
  },
  {
    name: "codec",
    source: `import { codec, date, datetime } from "DIST"; export const check = codec(datetime(), date(), { decode: (text) => new Date(text), encode: (value) => value.toISOString() });`,
    budget: 3500,
  },
  {
    name: "encode with an object and a codec",
    source: `import { codec, date, datetime, encode, object } from "DIST"; const at = codec(datetime(), date(), { decode: (text) => new Date(text), encode: (value) => value.toISOString() }); export const written = encode(object({ at }), { at: new Date(0) });`,
    budget: 10430,
  },
  {
    name: "standardJsonSchema with an object",
    source: `import { object, standardJsonSchema, string } from "DIST"; export const check = standardJsonSchema(object({ name: string() }));`,
    budget: 9100,
  },
  { name: "file", source: `import { file } from "DIST"; export const check = file({ maxSize: 1000 });`, budget: 2690 },
  {
    name: "file with contentType",
    source: `import { contentType, file } from "DIST"; export const check = file({ maxSize: 1000 }, contentType(["image/png"]));`,
    budget: 3130,
  },
  {
    name: "formData with an object",
    source: `import { file, formData, object, string } from "DIST"; export const check = formData(object({ name: string(), avatar: file() }));`,
    budget: 5070,
  },
  {
    name: "everything",
    source: `export * from "DIST";`,
    budget: 30120,
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
  const output = readFileSync(join(outDir, file as string));
  // A path the bundler cannot resolve is left as an import, and a bundle of one import line is tiny
  // enough to pass every budget, so make sure the package was actually inlined.
  if (/\bfrom\s*["']/.test(output.toString())) {
    throw new Error(`${name} did not bundle the package: an import was left unresolved`);
  }
  return gzipSync(output, { level: 9 }).length;
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
