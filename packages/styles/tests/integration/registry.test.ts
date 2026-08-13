import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

interface Registry {
  presentation: { fill: Record<string, FillPresentation>; edge: Record<string, unknown>; hoverStep: string };
  intents: Record<string, { family: string; aliases?: string[] }>;
  modifiers: Record<string, unknown>;
  components: ComponentEntry[];
  helpers?: { class: string }[];
  aesthetics?: { class: string }[];
}

const executeFile = promisify(execFile);
const packageRoot = path.dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const registry = JSON.parse(await readFile(path.join(packageRoot, "registry.json"), "utf8")) as Registry;
const read = async (file: string): Promise<string> => readFile(path.join(packageRoot, file), "utf8");

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

/* A published default is a promise about what a component looks like with no
   presentation class on it, so it has to be the number the component actually
   declares. Wave 1 only: the rest still carry their pre-refactor composition. */
test("every implemented component declares its published default", async () => {
  const sources = (
    await Promise.all(
      ["button.css", "form.css", "surface.css", "feedback.css", "loader.css"].map(async (file) =>
        read(`src/components/${file}`),
      ),
    )
  ).join("\n");
  const problems: string[] = [];

  for (const component of registry.components.filter(({ wave }) => wave === 1)) {
    const { fill, edge, elevation } = component.default;
    if (fill === undefined || edge === undefined) {
      continue;
    }
    for (const declaration of [
      `--_d-fill: ${registry.presentation.fill[fill]["ui-fill"]};`,
      `--_d-fg-on-fill: ${registry.presentation.fill[fill]["ui-fg-on-fill"]};`,
      `--_d-elevation: ${elevation};`,
    ]) {
      if (!sources.includes(declaration)) {
        problems.push(`${component.class} should declare ${declaration}`);
      }
    }
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
   never asked for. Declaring the whole geometry is the contract; a complete
   value satisfies it too, since it replaces every part at once. */
test("every aesthetic declares a whole shadow geometry", async () => {
  const parts = ["--ui-shadow-x", "--ui-shadow-y", "--ui-shadow-blur", "--ui-shadow-spread"];
  const sources = await Promise.all(
    (registry.aesthetics ?? []).map(async (aesthetic) => ({
      name: aesthetic.class,
      source: await read(`src/aesthetics/${aesthetic.class}.css`),
    })),
  );
  const problems = sources
    .filter(({ source }) => !source.includes("--ui-shadow:") && !source.includes("--ui-surface-shadow:"))
    .map(({ name, source }) => ({ missing: parts.filter((part) => !source.includes(`${part}:`)), name }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ missing, name }) => `${name} declares no ${missing.join(", ")}`);

  expect(problems).toEqual([]);
});
