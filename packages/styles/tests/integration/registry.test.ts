import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "vitest";

/* `registry.json` decides what the package supports, and four things read it:
   `hub generate`, the preview matrix, the browser conformance suite, and the
   public docs. A registry that contradicts itself therefore ships four
   contradictions, so every rule it has to hold is checked here rather than
   trusted. */

interface FillPresentation {
  "ui-fill": string;
  "ui-fg-on-fill": string;
}

interface ComponentEntry {
  class: string;
  role: string;
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
  roles: Record<string, { fill: string[]; edge: string[]; invariant: string | null }>;
  components: ComponentEntry[];
  helpers?: { class: string }[];
  aesthetics?: { class: string }[];
}

const executeFile = promisify(execFile);
const packageRoot = path.dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const registry = JSON.parse(await readFile(path.join(packageRoot, "registry.json"), "utf8")) as Registry;

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
   component that works until a consumer needs the utility it ate. */
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

test("every component's default presentation is one its role allows", () => {
  const problems: string[] = [];
  for (const component of registry.components) {
    const role = registry.roles[component.role];
    expect(role, `${component.class}: unknown role "${component.role}"`).toBeDefined();
    if (role.fill.length === 0 && role.edge.length === 0) {
      if (component.default.fill !== undefined || component.default.edge !== undefined) {
        problems.push(`${component.class}: an indicator must not declare a default fill or edge`);
      }
      continue;
    }
    if (!role.fill.includes(component.default.fill as string)) {
      problems.push(`${component.class}: fill "${component.default.fill}" is not allowed by role ${component.role}`);
    }
    if (!role.edge.includes(component.default.edge as string)) {
      problems.push(`${component.class}: edge "${component.default.edge}" is not allowed by role ${component.role}`);
    }
  }
  expect(problems).toEqual([]);
});

test("every role has members, states its invariant, and is exercised by wave 1", () => {
  const waveOneRoles = new Set(registry.components.filter(({ wave }) => wave === 1).map(({ role }) => role));
  const problems: string[] = [];
  for (const [name, role] of Object.entries(registry.roles)) {
    if (!registry.components.some((component) => component.role === name)) {
      problems.push(`role ${name} has no members`);
    }
    if (role.invariant === undefined) {
      problems.push(`role ${name}: an invariant must be stated, or explicitly null`);
    }
    /* A wave that skips a role does not prove the role, and the point of
       splitting the work in two was that the first half proves the model. */
    if (!waveOneRoles.has(name)) {
      problems.push(`role ${name} has no wave 1 component`);
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

/* The generated files are the registry's only route into the stylesheet, so a
   registry that no longer matches them means one of the two was edited by hand. */
test("the generated role membership matches the registry", async () => {
  const membership = await readFile(path.join(packageRoot, "src/roles/membership.css"), "utf8");
  const native = await readFile(path.join(packageRoot, "src/roles/native.css"), "utf8");
  const missing: string[] = [];

  if (!membership.includes(`--hover-step: ${registry.presentation.hoverStep};`)) {
    missing.push("the registry's hover step");
  }
  for (const component of registry.components) {
    if (!membership.includes(`.${component.class}`)) {
      missing.push(`.${component.class} is not in the membership`);
    }
    if (!membership.includes(`--_d-elevation: ${component.default.elevation};`)) {
      missing.push(`.${component.class} default elevation`);
    }
  }
  for (const selector of registry.components.flatMap((component) => component.native)) {
    if (!native.includes(selector)) {
      missing.push(`${selector} is not in the native membership`);
    }
  }
  expect(missing).toEqual([]);
});

test("the package publishes an entrypoint for every aesthetic in the registry", async () => {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
  };
  for (const aesthetic of registry.aesthetics ?? []) {
    expect(manifest.exports, `./aesthetics/${aesthetic.class}`).toHaveProperty(`./aesthetics/${aesthetic.class}`);
  }
});
