import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "vitest";

interface PackageManifest {
  exports: Record<string, string | Record<string, string>>;
}

interface TailwindExportContract {
  candidates?: string;
  patterns: RegExp[];
}

interface CompiledExportContract {
  target: string;
  patterns: RegExp[];
}

const executeFile = promisify(execFile);
const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
const packageRoot = path.dirname(packagePath);
const manifest = JSON.parse(await readFile(packagePath, "utf8")) as PackageManifest;
const exportTargets = Object.entries(manifest.exports).flatMap(([exportName, target]) =>
  typeof target === "string"
    ? [{ exportName, target }]
    : Object.entries(target).map(([condition, conditionTarget]) => ({
        exportName: `${exportName} (${condition})`,
        target: conditionTarget,
      })),
);
const tailwindCliPath = fileURLToPath(
  new URL("./dist/index.mjs", import.meta.resolve("@tailwindcss/cli/package.json")),
);
const tailwindCssUrl = new URL("./index.css", import.meta.resolve("tailwindcss/package.json")).href;
const tailwindExportContracts: Record<string, TailwindExportContract> = {
  "./tw": {
    candidates: "btn",
    patterns: [/\.btn\{[^}]*--_capped:/, /\.btn\{[^}]*background-color:var\(--_bg\)/],
  },
  "./tw/theme": { patterns: [/--color-primary:/] },
  "./tw/components": {
    candidates: "alert btn loading",
    patterns: [
      /\.alert\{--_capped:/,
      /\.btn\{[^}]*--_capped:/,
      /\.btn\.loading:after\{/,
      /mask-image:var\(--loader-art\)/,
    ],
  },
  "./tw/surface": {
    candidates: "panel",
    patterns: [/\.panel\{--_capped:/, /backdrop-filter:var\(--ui-backdrop,none\)/],
  },
  "./tw/button": {
    candidates: "btn loading",
    patterns: [/\.btn\{[^}]*--_capped:/, /\.btn\.loading:after\{/, /mask-image:var\(--loader-art\)/],
  },
  "./tw/form": {
    candidates: "ipt radio",
    patterns: [/\.ipt\{--_capped:/, /\.radio\{--_capped:/, /background-color:var\(--_bg\)/],
  },
  "./tw/feedback": {
    candidates: "alert badge progress",
    patterns: [/\.alert\{--_capped:/, /\.badge\{[^}]*--_capped:/, /\.progress\{/],
  },
  "./tw/loader": {
    candidates: "loader dots-wave",
    patterns: [/\.loader/, /\.dots-wave/, /mask-image:/],
  },
  "./tw/tooltip": {
    candidates: "tooltip",
    patterns: [/\.tooltip\{/, /\.tooltip\.tooltip-icon\{/, /--_capped:/, /background-color:var\(--_bg\)/],
  },
  "./tw/reset": { candidates: "text-body", patterns: [/:focus-visible\{/] },
  "./tw/native": { candidates: "btn", patterns: [/h1\{/, /button,/] },
  "./tw/typography": { candidates: "text-title", patterns: [/\.text-title\{/] },
  "./tw/utilities": {
    candidates: "stack data-table",
    patterns: [/\.stack\{/, /\.data-table\{/, /--_capped:/, /background-color:var\(--_bg\)/],
  },
  "./tw/aesthetics": { patterns: [/\.neobrutalism\{/, /\.glass\{/, /\.pixel\{/, /\.chunky-tile\{/] },
  "./tw/aesthetics/neobrutalism": { patterns: [/\.neobrutalism\{/, /--ui-shadow-x:/, /--ui-ink:/] },
  "./tw/aesthetics/glass": { patterns: [/\.glass\{/, /--ui-backdrop:/, /--glass-radius,/] },
  /* The bar is a shade of the element rather than a repeat of it, which takes the
     opaque depth colour as well as the ink amount. Both are asserted because
     either one alone leaves the bar invisible. */
  "./tw/aesthetics/chunky-tile": {
    patterns: [/\.chunky-tile\{/, /--tile-radius,/, /--elevation-color:/, /--ui-shadow-ink:/, /--ui-active-transform:/],
  },
  /* The aesthetic publishes the silhouette and the inset edge as material
     tokens; the declarations that consume them belong to `box` and `surface`. */
  "./tw/aesthetics/pixel": {
    patterns: [
      /\.pixel\{/,
      /--ui-clip:\s*polygon/,
      /--ui-clip-tight:\s*none/,
      /--ui-shadow-edge:/,
      /--ui-shadow-inset:/,
    ],
  },
};
const compiledExportContracts: Record<string, CompiledExportContract> = {
  ".": {
    target: "dist/index.css",
    patterns: [/--color-primary:/, /\.btn\{/, /\.stack\{/, /--_capped:/],
  },
  "./theme": { target: "dist/theme.css", patterns: [/--color-primary:/, /\.soft\{/] },
  "./components": {
    target: "dist/components.css",
    patterns: [
      /\.alert\{/,
      /\.btn\{/,
      /\.panel\{/,
      /\.field\{/,
      /\.loader\{/,
      /\.text-title\{/,
      /\.tooltip\{/,
      /--_capped:/,
    ],
  },
  "./native": { target: "dist/native.css", patterns: [/button,/, /h1\{/, /\.btn\{/] },
  "./aesthetics": {
    target: "dist/aesthetics/index.css",
    patterns: [/\.neobrutalism\{/, /\.glass\{/, /\.pixel\{/],
  },
  "./aesthetics/neobrutalism": {
    target: "dist/aesthetics/neobrutalism.css",
    patterns: [/\.neobrutalism\{/, /--ui-shadow-x:/],
  },
  "./aesthetics/glass": {
    target: "dist/aesthetics/glass.css",
    patterns: [/\.glass\{/, /--ui-backdrop:/, /prefers-reduced-transparency/],
  },
  "./aesthetics/pixel": {
    target: "dist/aesthetics/pixel.css",
    patterns: [/\.pixel\{/, /--ui-clip:polygon/, /--ui-shadow-inset:/],
  },
};
const aggregateExportTargets = ["dist/components.css", "dist/index.css"];
const representativePublicRules = [".box{--_capped:"];

test("every declared package export target exists after build", async () => {
  await Promise.all(
    exportTargets.map(({ exportName, target }) =>
      expect(
        readFile(path.resolve(packageRoot, target)),
        `expected ${exportName} target ${target} to exist`,
      ).resolves.toBeDefined(),
    ),
  );
});

for (const [exportName, contract] of Object.entries(compiledExportContracts)) {
  test(`${exportName} compiled export contains its representative public surface`, async () => {
    const output = await readFile(path.resolve(packageRoot, contract.target), "utf8");

    for (const pattern of contract.patterns) {
      expect(output, `${exportName} should contain ${pattern}`).toMatch(pattern);
    }
  });
}

/* The contracts above spot-check a handful of classes per entrypoint. A
   compiled bundle has no markup to scan, so a `@utility` emits only because the
   self-scan or an `@source inline` in that entrypoint's index names it -- and a
   new component added to `src/components/` that is missed in the inline list
   ships absent from `dist/components.css` with nothing failing, the mirror of
   the `.table` collision. This holds every `@utility` a compiled entrypoint's
   own source tree defines against its output.

   `roots` is the entrypoint's import closure, not just its directory: the
   `dist/components.css` index pulls `../box.css` and `../typography.css`
   alongside `./`, and a utility added to either belongs in that bundle. A
   functional `@utility name-*` keeps its trailing `*` so the match below can
   look for `.name-<value>` rather than a bare `.name`. */
async function definedUtilities(roots: string[]): Promise<string[]> {
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const absolute = path.resolve(packageRoot, root);

      if (root.endsWith(".css")) {
        return [await readFile(absolute, "utf8")];
      }
      const files = (await readdir(absolute, { recursive: true })).filter(
        (entry): entry is string => typeof entry === "string" && entry.endsWith(".css"),
      );

      return Promise.all(files.map((file) => readFile(path.join(absolute, file), "utf8")));
    }),
  );

  return [
    ...new Set(
      perRoot
        .flat()
        .flatMap((source) => [...source.matchAll(/@utility\s+([a-z][a-z0-9-]*\*?)\s*\{/g)].map((match) => match[1])),
    ),
  ];
}

const compiledCompleteness: Record<string, string[]> = {
  "dist/index.css": ["src"],
  "dist/components.css": ["src/components", "src/box.css", "src/typography.css", "src/theme.css"],
  "dist/native.css": ["src"],
};

for (const [target, roots] of Object.entries(compiledCompleteness)) {
  test(`${target} emits every @utility its source tree defines`, async () => {
    const output = await readFile(path.resolve(packageRoot, target), "utf8");
    const missing = (await definedUtilities(roots)).filter((name) => {
      /* A functional `@utility foo-*` emits as `.foo-<value>`; a static one as a
         bare `.foo`. The `*` is carried through so the two are told apart here. */
      const pattern = name.endsWith("*") ? String.raw`\.${name.slice(0, -1)}[a-z0-9]` : String.raw`\.${name}(?![\w-])`;

      return !new RegExp(pattern).test(output);
    });

    expect(missing, `${target} is missing rules for: ${missing.join(", ")}`).toEqual([]);
  });
}

test("aggregate exports emit each public rule expansion once", async () => {
  const aggregateOutputs = await Promise.all(
    aggregateExportTargets.map(async (target) => ({
      output: await readFile(path.resolve(packageRoot, target), "utf8"),
      target,
    })),
  );

  for (const { output, target } of aggregateOutputs) {
    for (const rule of representativePublicRules) {
      expect(output.split(rule).length - 1, `${target} should emit ${rule} once`).toBe(1);
    }
  }
});

for (const [exportName, contract] of Object.entries(tailwindExportContracts)) {
  test(`${exportName} emits its representative public surface`, async () => {
    const entry = manifest.exports[exportName];
    const target = typeof entry === "string" ? entry : (entry.style ?? entry.import ?? entry.default);
    expect(typeof target, `${exportName} must resolve to one CSS target`).toBe("string");

    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "codenhub-styles-export-"));
    const inputPath = path.join(temporaryRoot, "input.css");
    const outputPath = path.join(temporaryRoot, "output.css");
    const targetUrl = pathToFileURL(path.resolve(packageRoot, target as string)).href;
    const candidateSource = contract.candidates ? `@source inline("${contract.candidates}");\n` : "";

    try {
      await writeFile(inputPath, `@import "${tailwindCssUrl}";\n@import "${targetUrl}";\n${candidateSource}`);
      await executeFile(process.execPath, [tailwindCliPath, "-i", inputPath, "-o", outputPath, "--minify"], {
        cwd: packageRoot,
      });
      const output = await readFile(outputPath, "utf8");

      for (const pattern of contract.patterns) {
        expect(output, `${exportName} should emit ${pattern}`).toMatch(pattern);
      }
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });
}

/* Tailwind's content detection scans the whole package directory, and the
   compiled entrypoints narrow it back to `src/` with `@source not`. A miss in
   that list leaks: a `--color-<family>-<shade>` that appears only in a docs
   example -- the violet ramp in `docs/usage/theming.md`'s custom-intent block --
   compiles into a real `@theme` entry in the shipped CSS. This holds every
   palette color the build declares to one the stylesheet source actually
   references (comments included, because Tailwind scans those too). */
test("compiled entrypoints ship only palette colors the source references", async () => {
  const sourceDirectory = path.resolve(packageRoot, "src");
  const sourceFiles = (await readdir(sourceDirectory, { recursive: true })).filter(
    (entry): entry is string => typeof entry === "string" && entry.endsWith(".css"),
  );
  const sourceText = (
    await Promise.all(sourceFiles.map((file) => readFile(path.join(sourceDirectory, file), "utf8")))
  ).join("\n");
  const referenced = new Set(sourceText.match(/--color-[a-z]+-\d+/g) ?? []);

  const outputs = await Promise.all(
    ["dist/index.css", "dist/native.css", "dist/components.css", "dist/theme.css"].map(async (target) => ({
      target,
      output: await readFile(path.resolve(packageRoot, target), "utf8"),
    })),
  );
  const leaks = outputs.flatMap(({ target, output }) =>
    [...new Set(output.match(/--color-[a-z]+-\d+(?=\s*:)/g) ?? [])]
      .filter((declared) => !referenced.has(declared))
      .map((declared) => `${target} declares ${declared}, which src/ never references`),
  );

  expect(leaks).toEqual([]);
});
