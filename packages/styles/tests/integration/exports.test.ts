import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const target = manifest.exports[exportName];
    expect(typeof target, `${exportName} must have one CSS target`).toBe("string");

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
