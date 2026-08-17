import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "vitest";

/* `registry.json` is the list of what the package supports. It does not produce
   the stylesheet -- the stylesheet is hand-written -- so its job is to be
   checked against it, and against itself.

   This file is its only reader. Every field the registry carries is therefore
   either checked here or documentation, and the schema beside it is enforced by
   the first test below rather than by a validator nobody runs. */

interface FillPresentation {
  "ui-fill": string;
  "ui-fg-on-fill": string;
}

interface ComponentEntry {
  class: string;
  default: { fill?: string; edge?: string; ground?: string; elevation: number };
  art?: string[];
  native: string[];
  renamedFrom?: string;
  renameReason?: string;
  composition?: "frame" | "none";
  compositionReason?: string;
}

interface AestheticEntry {
  class: string;
  completeShadow: boolean;
  completeShadowReason?: string;
  selectorReason?: string;
  selectors?: string[];
}

interface Registry {
  presentation: {
    fill: Record<string, FillPresentation>;
    edge: Record<string, { "ui-border": string }>;
    hoverStep: string;
  };
  intents: Record<string, { aliases?: string[]; family: string; fillMax: string }>;
  modifiers: Record<string, unknown>;
  components: ComponentEntry[];
  helpers?: string[];
  aesthetics?: AestheticEntry[];
}

const executeFile = promisify(execFile);
const packageRoot = path.dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const registry = JSON.parse(await readFile(path.join(packageRoot, "registry.json"), "utf8")) as Registry;
const read = async (file: string): Promise<string> => readFile(path.join(packageRoot, file), "utf8");

/* Every stylesheet the package ships, so a check covers what is there rather
   than a list someone has to remember to extend. */
async function sourceFiles(): Promise<{ file: string; source: string }[]> {
  const entries = await readdir(path.join(packageRoot, "src"), { recursive: true });
  return Promise.all(
    entries
      .filter((entry) => entry.endsWith(".css"))
      .map((entry) => entry.split(path.sep).join("/"))
      .map(async (file) => ({ file, source: await read(path.posix.join("src", file)) })),
  );
}

function shippedClassNames(): string[] {
  const modifiers = Object.entries(registry.modifiers).flatMap(([group, value]) =>
    group === "elevation" ? Object.keys(value as object) : (value as string[]),
  );
  return [
    ...Object.keys(registry.presentation.fill),
    ...Object.keys(registry.presentation.edge),
    ...Object.keys(registry.intents),
    ...Object.values(registry.intents).flatMap((intent) => intent.aliases ?? []),
    ...modifiers,
    ...registry.components.map((component) => component.class),
    ...registry.components.flatMap((component) => component.art ?? []),
    ...(registry.helpers ?? []),
    ...(registry.aesthetics ?? []).map((aesthetic) => aesthetic.class),
  ];
}

/* Every aesthetic paired with its registry entry, so a check can hold the two
   against each other. */
async function aestheticSources(): Promise<{ aesthetic: AestheticEntry; name: string; source: string }[]> {
  return Promise.all(
    (registry.aesthetics ?? []).map(async (aesthetic) => ({
      aesthetic,
      name: aesthetic.class,
      source: await read(`src/aesthetics/${aesthetic.class}.css`),
    })),
  );
}

/* Comments name components constantly and legitimately -- they explain what a
   token reaches. Only selectors are the violation. */
const withoutComments = (source: string): string => source.replaceAll(/\/\*[\s\S]*?\*\//g, "");

/* The schema documents the registry's shape, and a schema nothing runs is a
   comment with punctuation. This walks the two together rather than pulling in a
   validator: the registry uses one small corner of JSON Schema -- type, required,
   properties, additionalProperties, items, pattern, enum, minimum, maximum,
   dependentRequired -- and covering exactly that corner costs less than the
   dependency would. Anything the schema grows beyond it fails loudly below. */
const SUPPORTED_KEYWORDS = new Set([
  "$id",
  "$schema",
  "additionalProperties",
  "const",
  "dependentRequired",
  "description",
  "enum",
  "else",
  "if",
  "items",
  "maximum",
  "minimum",
  "pattern",
  "properties",
  "required",
  "title",
  "then",
  "type",
  "uniqueItems",
]);

interface Schema {
  additionalProperties?: boolean | Schema;
  const?: unknown;
  dependentRequired?: Record<string, string[]>;
  enum?: unknown[];
  else?: Schema;
  if?: Schema;
  items?: Schema;
  maximum?: number;
  minimum?: number;
  pattern?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  then?: Schema;
  type?: string | string[];
  uniqueItems?: boolean;
  [keyword: string]: unknown;
}

function validate(value: unknown, schema: Schema, path: string, problems: string[]): void {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      problems.push(`${path}: schema uses unsupported keyword "${keyword}"`);
    }
  }

  const types = schema.type === undefined ? [] : [schema.type].flat();
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const matches = actual === "number" && Number.isInteger(value) ? [actual, "integer"] : [actual];

  if (types.length > 0 && !types.some((type: string) => matches.includes(type))) {
    problems.push(`${path}: expected ${types.join(" or ")}, got ${actual}`);
    return;
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    problems.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  }

  if (schema.const !== undefined && value !== schema.const) {
    problems.push(`${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (schema.if !== undefined) {
    const conditionProblems: string[] = [];

    validate(value, schema.if, path, conditionProblems);
    validate(value, conditionProblems.length === 0 ? (schema.then ?? {}) : (schema.else ?? {}), path, problems);
  }

  if (typeof value === "string" && schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
    problems.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      problems.push(`${path}: ${value} is below ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      problems.push(`${path}: ${value} is above ${schema.maximum}`);
    }
  }

  if (Array.isArray(value) && schema.uniqueItems === true) {
    /* Comparison by serialization, which is enough for the arrays the registry
       holds: they are strings and flat objects with stable key order. */
    const seen = new Set(value.map((entry) => JSON.stringify(entry)));

    if (seen.size !== value.length) {
      problems.push(`${path}: contains duplicate entries`);
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    const items = schema.items;

    value.forEach((entry, index) => validate(entry, items, `${path}[${index}]`, problems));
    return;
  }

  if (actual !== "object") {
    return;
  }

  const entries = value as Record<string, unknown>;

  for (const key of schema.required ?? []) {
    if (!(key in entries)) {
      problems.push(`${path}: missing required "${key}"`);
    }
  }

  for (const [key, dependents] of Object.entries(schema.dependentRequired ?? {})) {
    if (key in entries) {
      for (const dependent of dependents as string[]) {
        if (!(dependent in entries)) {
          problems.push(`${path}: "${key}" requires "${dependent}"`);
        }
      }
    }
  }

  for (const [key, entry] of Object.entries(entries)) {
    const property = schema.properties?.[key];

    if (property !== undefined) {
      validate(entry, property, `${path}.${key}`, problems);
    } else if (schema.additionalProperties === false) {
      problems.push(`${path}: unexpected property "${key}"`);
    } else if (typeof schema.additionalProperties === "object") {
      validate(entry, schema.additionalProperties, `${path}.${key}`, problems);
    }
  }
}

test("the registry matches the schema beside it", async () => {
  const schema = JSON.parse(await read("registry.schema.json")) as Schema;
  const problems: string[] = [];

  validate(registry, schema, "registry", problems);

  expect(problems).toEqual([]);
});

test("component defaults require fill and edge unless composition is none", async () => {
  const schema = JSON.parse(await read("registry.schema.json")) as Schema;
  const componentSchema = schema.properties?.components?.items;
  const normal = structuredClone(registry.components.find((component) => component.class === "btn")!);
  const unboxed = structuredClone(registry.components.find((component) => component.composition === "none")!);
  const normalProblems: string[] = [];
  const unboxedProblems: string[] = [];

  delete normal.default.fill;
  delete normal.default.edge;
  validate(normal, componentSchema!, "btn", normalProblems);
  validate(unboxed, componentSchema!, "quote", unboxedProblems);

  expect(normalProblems).toEqual(['btn.default: missing required "fill"', 'btn.default: missing required "edge"']);
  expect(unboxedProblems).toEqual([]);
});

test("no class name is claimed twice", () => {
  const seen = new Map<string, number>();
  for (const name of shippedClassNames()) {
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  expect([...seen].filter(([, count]) => count > 1).map(([name]) => name)).toEqual([]);
});

/* `.table` shipped for months as a silent replacement for Tailwind's
   `display: table`, and nobody noticed, because a collision looks like a
   component that works right up until a consumer needs the utility it ate. */
test("no class name collides with a Tailwind static utility", async () => {
  const names = [...new Set(shippedClassNames())];
  const tailwindCliPath = fileURLToPath(
    new URL("./dist/index.mjs", import.meta.resolve("@tailwindcss/cli/package.json")),
  );
  const utilitiesUrl = new URL("./utilities.css", import.meta.resolve("tailwindcss/package.json")).href;
  const themeUrl = new URL("./theme.css", import.meta.resolve("tailwindcss/package.json")).href;
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "codenhub-styles-registry-"));
  const inputPath = path.join(temporaryRoot, "input.css");
  const outputPath = path.join(temporaryRoot, "output.css");

  try {
    await writeFile(
      inputPath,
      `@import "${utilitiesUrl}";\n@import "${themeUrl}";\n@source inline("${names.join(" ")}");\n`,
    );
    await executeFile(process.execPath, [tailwindCliPath, "-i", inputPath, "-o", outputPath], { cwd: packageRoot });
    const emitted = new Set(
      [...(await readFile(outputPath, "utf8")).matchAll(/^\.([a-z0-9-]+)\s*\{/gm)].map((match) => match[1]),
    );
    expect(names.filter((name) => emitted.has(name))).toEqual([]);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}, 30_000);

/* A default naming a presentation that does not exist renders as nothing at
   all, because the missing percentage makes the whole `color-mix()` invalid. */
test("every component's default names a presentation that exists", () => {
  const problems: string[] = [];
  for (const { class: name, default: resting } of registry.components) {
    if (resting.fill !== undefined && registry.presentation.fill[resting.fill] === undefined) {
      problems.push(`${name}: unknown fill "${resting.fill}"`);
    }
    if (resting.edge !== undefined && registry.presentation.edge[resting.edge] === undefined) {
      problems.push(`${name}: unknown edge "${resting.edge}"`);
    }
    if ((resting.fill === undefined) !== (resting.edge === undefined)) {
      problems.push(`${name}: declares one half of a presentation pair`);
    }
  }
  expect(problems).toEqual([]);
});

/* The two intent resets are the only selector lists in the package maintained by
   hand, so they are the two worth checking. A component missing from one reads
   an undefined `--intent-*`, which makes every `color-mix()` referencing it
   invalid at computed-value time and silently drops the declaration -- so the
   component renders as nothing rather than as an error. */
const whereSelectors = (source: string): Set<string> => {
  const open = source.indexOf(":where(") + ":where(".length;

  return new Set(
    source
      .slice(open, source.indexOf(")", open))
      .split(",")
      .map((selector) => selector.trim()),
  );
};

test("every component is in an intent reset", async () => {
  /* Both lists are read as selector lists, and the native one has to be: asking
     whether the file text contains the element name passes on any file long
     enough to contain it anywhere. `pre` is inside `prefers-reduced-transparency`
     and `select` is inside `selector`, so most of these elements could have been
     missing from the reset with this test still green. */
  const reset = whereSelectors(await read("src/intent.css"));
  const native = whereSelectors(await read("src/native.css"));
  const problems: string[] = [];

  for (const { class: name } of registry.components) {
    if (!reset.has(`.${name}`)) {
      problems.push(`.${name} is missing from the intent reset in intent.css`);
    }
  }
  for (const selector of registry.components.flatMap((component) => component.native)) {
    const element = selector.split(/[.:[]/)[0];
    if (!native.has(element)) {
      problems.push(`${element} is missing from the native intent reset in native.css`);
    }
  }
  expect(problems).toEqual([]);
});

/* Every `@utility <name> { ... }` in `src/`, keyed by name, so a check can ask
   what one component declares instead of whether a string appears somewhere in
   five concatenated files. */
async function shippedUtilities(): Promise<Map<string, string>> {
  const files = await sourceFiles();
  const blocks = new Map<string, string>();

  for (const { source } of files) {
    for (const match of source.matchAll(/@utility\s+([a-z0-9-]+)\s*\{/g)) {
      let depth = 0;
      let index = match.index + match[0].length - 1;
      const start = index;
      do {
        depth += source[index] === "{" ? 1 : source[index] === "}" ? -1 : 0;
        index += 1;
      } while (depth > 0 && index < source.length);
      blocks.set(match[1], source.slice(start, index));
    }
  }
  return blocks;
}

/* A utility's own declarations, with every nested selector and at-rule dropped.
   The two guards below ask what a component declares at rest, and `&:hover`,
   `&.compact` and `&.interactive` all sit inside the same block, so a component
   setting its fill only on hover would otherwise read as having declared it.
   `shippedUtilities` slices from the opening brace, so the walk starts past it. */
function rootDeclarations(block: string): string {
  let root = "";
  let depth = 0;

  for (let index = 1; index < block.length; index += 1) {
    const char = block[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      if (depth === 0) {
        break;
      }
      depth -= 1;
    } else if (depth === 0) {
      root += char;
    }
  }
  return root;
}

/* Shared composition rather than components: they are `@utility` so `@apply` can
   reach them, which also makes them class names a consumer could type. The
   registry does not list them, because they publish no per-component default for
   it to hold. Two of them -- `text-control` and `surface` -- are documented all
   the same, as the low-level boxes a consumer builds on when the package ships
   no component for what they are making; the other three are internal. Both
   documented ones are in the intent reset, which is what a typeable class needs
   to paint at all. */
const composition = new Set(["box", "box-hover", "surface", "text-control", "loader-mask"]);

/* The registry is the list of what the package supports, so a utility it does
   not name is either drift or an accidental part of the public surface. `.table`
   shipped for months this way. */
test("every shipped utility is in the registry", async () => {
  const known = new Set([
    ...registry.components.map((component) => component.class),
    ...registry.components.flatMap((component) => component.art ?? []),
    ...(registry.helpers ?? []),
    ...composition,
  ]);
  expect([...(await shippedUtilities()).keys()].filter((name) => !known.has(name))).toEqual([]);
});

/* A published default is a promise about what a component looks like with no
   presentation class on it, so it has to be the number the component actually
   declares -- in its own block, not somewhere in the package.

   `composition: "none"` exempts only components that publish neither axis.
   `.quote` paints its own left bar, but still publishes a fill and edge, so its
   custom renderer must declare those defaults. */
test("every component declares its published default", async () => {
  const utilities = await shippedUtilities();
  const problems: string[] = [];

  for (const component of registry.components) {
    const { fill, edge, ground, elevation } = component.default;
    if (component.composition === "none" && fill === undefined && edge === undefined) {
      continue;
    }
    const fillPresentation = fill === undefined ? undefined : registry.presentation.fill[fill];
    const edgePresentation = edge === undefined ? undefined : registry.presentation.edge[edge];
    if (fillPresentation === undefined || edgePresentation === undefined) {
      problems.push(`${component.class} has a missing or invalid published fill or edge`);
      continue;
    }
    const block = utilities.get(component.class);
    if (block === undefined) {
      problems.push(`${component.class} ships no @utility`);
      continue;
    }
    /* All four, every time. A missing `--_d-fg-on-fill` silently inherits a
       colour and a missing `--_d-border` silently drops the border, because an
       undefined `var()` inside `color-mix()` invalidates the declaration rather
       than reporting anything. */
    for (const declaration of [
      `--_d-fill: ${fillPresentation["ui-fill"]};`,
      `--_d-fg-on-fill: ${fillPresentation["ui-fg-on-fill"]};`,
      `--_d-border: ${edgePresentation["ui-border"]};`,
      `--_d-elevation: ${elevation};`,
      /* The ground is the fifth, where a component has one. It is what a
         component at 0% fill sits on, so leaving it out is the difference
         between a tinted plate and a transparent one. */
      ...(ground === undefined ? [] : [`--_d-ground: var(${ground});`]),
    ]) {
      if (!block.includes(declaration)) {
        problems.push(`${component.class} should declare ${declaration}`);
      }
    }
  }
  expect(problems).toEqual([]);
});

/* The same contract as above, for the shared utilities rather than the
   components. They are `@utility`, so they are class names a consumer can type,
   and `box` reads `--_d-fill`, `--_d-fg-on-fill` and `--_d-border` with no
   fallback -- that absence is what forces a component to state its whole resting
   geometry in one place. A utility that composes `box` and leaves one out paints
   nothing where that slot was read, because an undefined `var()` inside a
   `color-mix()` invalidates the declaration instead of reporting anything.
   `surface` shipped that way: bare `surface` had no fill and no border. */
test("every composition utility that takes box states its resting geometry", async () => {
  const utilities = await shippedUtilities();
  const problems: string[] = [];

  for (const name of composition) {
    const block = utilities.get(name);

    if (name === "box" || block === undefined) {
      continue;
    }
    const root = rootDeclarations(block);
    const applied = [...root.matchAll(/@apply ([^;]*);/g)].flatMap(([, list]) => list.trim().split(/\s+/));

    if (!applied.includes("box")) {
      continue;
    }
    for (const slot of ["--_d-fill", "--_d-fg-on-fill", "--_d-border"]) {
      if (!root.includes(`${slot}:`)) {
        problems.push(`${name} should declare ${slot}`);
      }
    }
  }
  expect(problems).toEqual([]);
});

/* `@apply` inlines the utility's declarations where it is written, so anything
   the utility declares itself wins over the same slot written above it. A
   component's own resting geometry therefore has to come after the composition
   it applies: `surface` is bare and edged, and a solid tooltip stating its fill
   first would paint as a bare one with nothing to show for it. */
test("a component states its resting geometry after the composition it applies", async () => {
  const utilities = await shippedUtilities();
  const slots = ["--_d-fill", "--_d-fg-on-fill", "--_d-border"];
  const declaring = [...composition].filter((name) => {
    const block = utilities.get(name);

    return block !== undefined && slots.some((slot) => rootDeclarations(block).includes(slot + ":"));
  });
  const problems: string[] = [];

  for (const [name, block] of utilities) {
    const root = rootDeclarations(block);

    for (const applied of declaring) {
      if (name === applied) {
        continue;
      }
      const at = [...root.matchAll(/@apply ([^;]*);/g)].find(([, list]) =>
        list.trim().split(/\s+/).includes(applied),
      )?.index;

      if (at === undefined) {
        continue;
      }
      for (const slot of slots) {
        const own = root.indexOf(slot + ":");

        if (own !== -1 && own < at) {
          problems.push(`${name} declares ${slot} above its @apply ${applied}`);
        }
      }
    }
  }
  expect(problems).toEqual([]);
});

/* The two guards above are only as good as the walk that feeds them, and it is
   a hand-rolled brace counter over text. One block carries all three cases: a
   slot at the root, a slot nested inside a selector, and a slot at the root
   after that nesting closes -- which is where an off-by-one in the depth count
   shows up. A silent bug here weakens both guards without failing anything. */
test("the root walk keeps a component's own declarations and drops its nested ones", () => {
  const root = rootDeclarations(`{
  @apply box;
  --_d-fill: 100%;
  &:hover {
    --_d-fg-on-fill: 100%;
  }
  --_d-border: 100%;
}`);

  expect(root).toContain("@apply box;");
  expect(root).toContain("--_d-fill:");
  expect(root, "declared only on hover").not.toContain("--_d-fg-on-fill:");
  expect(root, "after the nesting closes").toContain("--_d-border:");
});

/* R7. Elevation multiplies every shadow length, and `calc(0 * 1)` is a number
   where a length is required: the whole `box-shadow` becomes invalid at
   computed-value time, which for a non-inherited property means `none`. One
   unitless zero removes every shadow the aesthetic reaches. */
test("every shadow length carries a unit", async () => {
  const files = await sourceFiles();
  const problems: string[] = [];

  for (const { file, source } of files) {
    for (const match of source.matchAll(/(--ui-[a-z-]*shadow-(?:x|y|blur|spread))\s*:\s*([^;]+);/g)) {
      if (/^-?\d+(?:\.\d+)?$/.test(match[2].trim())) {
        problems.push(`src/${file}: ${match[1]} is unitless (${match[2].trim()})`);
      }
    }
  }
  expect(problems).toEqual([]);
});

test("the published hover step is the one the theme declares", async () => {
  expect(await read("src/theme.css")).toContain(`--hover-step: ${registry.presentation.hoverStep};`);
});

/* R1. An aesthetic sets material, not amount and not hue. A presentation token
   here would pin every component to one fill regardless of the class on it; an
   intent slot would repaint components the aesthetic never meant to reach,
   because unlike material, hue is not supposed to cascade. `--ui-ink` is the one
   intent-adjacent token an aesthetic owns, which is how it restates the neutral
   line without naming anything. */
test("no aesthetic sets a presentation token or an intent slot", async () => {
  const forbidden = new Set(["--ui-border", "--ui-elevation", "--ui-fg-on-fill", "--ui-fill"]);
  const problems = (await aestheticSources()).flatMap(({ name, source }) =>
    [...withoutComments(source).matchAll(/(--[a-z-]+)\s*:/g)]
      .map((match) => match[1])
      .filter((property) => forbidden.has(property) || property.startsWith("--intent-"))
      .map((property) => `${name} sets ${property}`),
  );

  expect([...new Set(problems)]).toEqual([]);
});

/* R3. An aesthetic reaches a component through tokens, so it never has to know
   the component exists -- which is what lets a new aesthetic work on a component
   written after it, and a component get every aesthetic for free. Before this
   rule the three shipped aesthetics named 4, 17 and 19 components, each list
   written twice, once for the ancestor case and once for the self-applied one.

   Not a ban. A treatment that genuinely cannot be a token -- an extra painted
   layer, a text transform -- is a selector list the aesthetic owns. This is a
   receipt: the registry records which components an aesthetic names and why, the
   same way it records a rename, so the cost stays countable instead of
   accumulating one reasonable exception at a time. */
test("an aesthetic names a component only with a recorded reason", async () => {
  const components = registry.components.map((component) => component.class);
  const problems: string[] = [];

  for (const { aesthetic, name, source } of await aestheticSources()) {
    const recorded = new Set(aesthetic.selectors ?? []);
    const selectors = withoutComments(source);
    const named = components.filter((component) => selectors.includes(`.${component}`));

    if (recorded.size > 0 && aesthetic.selectorReason === undefined) {
      problems.push(`${name}: selectors without selectorReason`);
    }
    problems.push(
      ...named
        .filter((component) => !recorded.has(component))
        .map((component) => `${name} names .${component}, and the registry does not record it`),
      ...[...recorded]
        .filter((component) => !named.includes(component))
        .map((component) => `${name} records .${component}, which it no longer names`),
    );
  }
  expect(problems).toEqual([]);
});

test("the package publishes an entrypoint for every aesthetic in the registry", async () => {
  const manifest = JSON.parse(await read("package.json")) as { exports: Record<string, unknown> };
  for (const aesthetic of registry.aesthetics ?? []) {
    expect(manifest.exports, `./aesthetics/${aesthetic.class}`).toHaveProperty(`./aesthetics/${aesthetic.class}`);
  }
});

/* Shadow parts resolve individually, so an omitted part can come from another
   aesthetic in scope or fall through to component- or foundation-owned geometry,
   producing mixed material. Declaring the whole geometry is the contract, and
   there is no exemption from it: `--ui-surface-shadow` replaces the shadow of
   surfaces only, so the parts still paint every button, chip and control. */
test("every aesthetic declares a whole shadow geometry", async () => {
  const parts = ["--ui-shadow-x", "--ui-shadow-y", "--ui-shadow-blur", "--ui-shadow-spread"];
  const sources = await Promise.all(
    (registry.aesthetics ?? []).map(async (aesthetic) => ({
      name: aesthetic.class,
      source: await read(`src/aesthetics/${aesthetic.class}.css`),
    })),
  );
  const problems = sources
    .map(({ name, source }) => ({ missing: parts.filter((part) => !source.includes(`${part}:`)), name }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ missing, name }) => `${name} declares no ${missing.join(", ")}`);

  expect(problems).toEqual([]);
});

/* `family` is the only record that `.secondary` maps onto the accent palette
   rather than a `--color-secondary-*` family that does not exist, and the
   browser suite hard-codes the same mapping. Held against the stylesheet so the
   registry cannot drift from the slots an intent actually declares.

   `fillMax` is checked the same way, and it is what makes this test a mechanism
   rather than a record. Six intents declare `100%`, which is also what `box`
   falls back to, so omitting the slot looks harmless while reading -- and is
   not: the reset writes neutral's cap onto every component root, so an intent
   that leaves the slot alone inherits a limit it never asked for and quietly
   loses most of its fill. The symptom is a slightly pale button, which is
   exactly the kind of thing that ships. */
test("every intent maps onto the color family and fill cap the registry names", async () => {
  const intent = await read("src/intent.css");
  const problems: string[] = [];

  for (const [name, { family, fillMax }] of Object.entries(registry.intents)) {
    const block = intent.match(new RegExp(String.raw`(^|\n)\.${name}(?![A-Za-z0-9_-])[^{]*` + `{([^}]*)}`));

    if (block === null) {
      problems.push(`.${name} has no block in intent.css`);
      continue;
    }
    if (!block[2].includes(`--intent-color: var(--color-${family})`)) {
      problems.push(`.${name} should map --intent-color onto --color-${family}`);
    }
    if (!block[2].includes(`--intent-fill-max: ${fillMax}`)) {
      problems.push(`.${name} should declare --intent-fill-max: ${fillMax}`);
    }
  }

  expect(problems).toEqual([]);
});

test("documents the neutral intent fill cap in every generated reference", async () => {
  const expected = registry.intents.neutral.fillMax;
  const sources = { "docs/tokens.md": await read("docs/tokens.md"), "llms-full.txt": await read("llms-full.txt") };

  expect(expected).toBe("20%");
  for (const [file, source] of Object.entries(sources)) {
    const match = source.match(/Neutral stops at `([0-9]+%)`/);

    expect(match, `${file} should document the neutral fill cap`).not.toBeNull();
    expect(match?.[1], `${file} neutral fill cap`).toBe(expected);
  }
});

/* Both resets stand in for a missing intent class, so they owe every slot an
   intent class writes. A slot missing from one of them is an undefined `var()`
   inside whichever `color-mix()` reads it, and that declaration collapses to its
   initial value without reporting anything. */
test("both intent resets declare every slot the neutral intent declares", async () => {
  const sources = { "intent.css": await read("src/intent.css"), "native.css": await read("src/native.css") };
  const problems: string[] = [];
  const neutralMatch = sources["intent.css"].match(/(?:^|\n)\.neutral(?![A-Za-z0-9_-])[^{}]*\{([^{}]*)}/);

  if (neutralMatch === null) {
    problems.push("intent.css: could not extract .neutral intent block");
  }

  const slots = [...(neutralMatch?.[1] ?? "").matchAll(/--intent-[a-z-]+(?=:)/g)].map((match) => match[0]);

  expect(slots.length).toBeGreaterThan(0);

  for (const [file, source] of Object.entries(sources)) {
    const resetMatch = source.match(/:where\((?:[^()]|\([^()]*\))*\)\s*\{([^{}]*--intent-color[^{}]*)}/);

    if (resetMatch === null) {
      problems.push(`${file}: could not extract intent reset`);
      continue;
    }
    const reset = resetMatch[1];

    for (const slot of slots) {
      if (!reset.includes(`${slot}:`)) {
        problems.push(`the intent reset in ${file} is missing ${slot}`);
      }
    }
  }

  expect(problems).toEqual([]);
});

/* An aesthetic that gives a shadow whole rather than as parts opts out of the
   elevation multiplier, because there is nothing left for the number to reach.
   `.flat` silently doing nothing is the kind of hole that has to be published
   rather than discovered, so the flag is held against the stylesheet and the
   schema requires a reason beside it. */
test("every aesthetic's complete-shadow flag matches its stylesheet", async () => {
  const problems = (await aestheticSources())
    .map(({ aesthetic, name, source }) => ({
      complete: /--ui-(surface-)?shadow:/.test(withoutComments(source)),
      declared: aesthetic.completeShadow,
      name,
    }))
    .filter(({ complete, declared }) => complete !== declared)
    .map(
      ({ complete, name }) =>
        `${name} ${complete ? "gives a shadow whole but declares completeShadow: false" : "declares completeShadow: true but gives its shadow as parts"}`,
    );

  expect(problems).toEqual([]);
});
