import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "vitest";

/* `registry.json` is the list of what the package supports. It does not produce
   the stylesheet -- the stylesheet is hand-written -- so its job is to be
   checked against it, and against itself. The docs, the preview matrix and the
   browser suite all read it, so a registry that disagrees with the CSS
   disagrees in three more places downstream. */

interface FillPresentation {
  "ui-fill": string;
  "ui-fg-on-fill": string;
}

interface ComponentEntry {
  class: string;
  default: { fill?: string; edge?: string; elevation: number };
  art?: string[];
  native: string[];
  renamedFrom?: string;
  renameReason?: string;
  wave: number;
}

interface AestheticEntry {
  class: string;
  selectorReason?: string;
  selectors?: string[];
}

interface Registry {
  presentation: {
    fill: Record<string, FillPresentation>;
    edge: Record<string, { "ui-border": string }>;
    hoverStep: string;
  };
  intents: Record<string, { family: string; aliases?: string[] }>;
  modifiers: Record<string, unknown>;
  components: ComponentEntry[];
  helpers?: { class: string }[];
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
    ...(registry.helpers ?? []).map((helper) => helper.class),
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

test("every rename carries the reason it happened", () => {
  const problems = registry.components
    .filter((component) => component.renamedFrom !== undefined && component.renameReason === undefined)
    .map((component) => `${component.class}: renamedFrom without renameReason`);
  expect(problems).toEqual([]);
});

/* The two intent resets are the only selector lists in the package maintained by
   hand, so they are the two worth checking. A component missing from one reads
   an undefined `--intent-*`, which makes every `color-mix()` referencing it
   invalid at computed-value time and silently drops the declaration -- so the
   component renders as nothing rather than as an error. */
test("every component is in an intent reset", async () => {
  const intent = await read("src/intent.css");
  const native = await read("src/native.css");
  const open = intent.indexOf(":where(") + ":where(".length;
  const reset = new Set(
    intent
      .slice(open, intent.indexOf(")", open))
      .split(",")
      .map((selector) => selector.trim()),
  );
  const problems: string[] = [];

  for (const { class: name } of registry.components) {
    if (!reset.has(`.${name}`)) {
      problems.push(`.${name} is missing from the intent reset in intent.css`);
    }
  }
  for (const selector of registry.components.flatMap((component) => component.native)) {
    const element = selector.split(/[.:[]/)[0];
    if (!native.includes(element)) {
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

/* Shared composition rather than components: they are `@utility` so `@apply` can
   reach them, which also makes them class names a consumer could type. They are
   deliberately undocumented, and the registry does not list them. */
const composition = new Set([
  "box",
  "box-hover",
  "surface",
  "text-control",
  "control-base",
  "shaped",
  "shaped-tight",
  "loader-mask",
]);

/* The registry is the list of what the package supports, so a utility it does
   not name is either drift or an accidental part of the public surface. `.table`
   shipped for months this way. */
test("every shipped utility is in the registry", async () => {
  const known = new Set([
    ...registry.components.map((component) => component.class),
    ...registry.components.flatMap((component) => component.art ?? []),
    ...(registry.helpers ?? []).map((helper) => helper.class),
    ...composition,
  ]);
  expect([...(await shippedUtilities()).keys()].filter((name) => !known.has(name))).toEqual([]);
});

/* A published default is a promise about what a component looks like with no
   presentation class on it, so it has to be the number the component actually
   declares -- in its own block, not somewhere in the package. Wave 1 only: the
   rest still carry their pre-refactor composition. */
test("every implemented component declares its published default", async () => {
  const utilities = await shippedUtilities();
  const problems: string[] = [];

  for (const component of registry.components.filter(({ wave }) => wave === 1)) {
    const { fill, edge, elevation } = component.default;
    if (fill === undefined || edge === undefined) {
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
      `--_d-fill: ${registry.presentation.fill[fill]["ui-fill"]};`,
      `--_d-fg-on-fill: ${registry.presentation.fill[fill]["ui-fg-on-fill"]};`,
      `--_d-border: ${registry.presentation.edge[edge]["ui-border"]};`,
      `--_d-elevation: ${elevation};`,
    ]) {
      if (!block.includes(declaration)) {
        problems.push(`${component.class} should declare ${declaration}`);
      }
    }
  }
  expect(problems).toEqual([]);
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

/* Shadow parts fall back individually, so an aesthetic that sets an offset but
   not a blur inherits the structural blur a surface carries and gets a shape it
   never asked for. Declaring the whole geometry is the contract; `--ui-shadow`
   satisfies it too, since it replaces every part on every component at once.
   `--ui-surface-shadow` does not: it replaces the shadow of surfaces only, and
   the parts still paint every button, chip and control on the page. */
test("every aesthetic declares a whole shadow geometry", async () => {
  const parts = ["--ui-shadow-x", "--ui-shadow-y", "--ui-shadow-blur", "--ui-shadow-spread"];
  const sources = await Promise.all(
    (registry.aesthetics ?? []).map(async (aesthetic) => ({
      name: aesthetic.class,
      source: await read(`src/aesthetics/${aesthetic.class}.css`),
    })),
  );
  const problems = sources
    .filter(({ source }) => !source.includes("--ui-shadow:"))
    .map(({ name, source }) => ({ missing: parts.filter((part) => !source.includes(`${part}:`)), name }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ missing, name }) => `${name} declares no ${missing.join(", ")}`);

  expect(problems).toEqual([]);
});
