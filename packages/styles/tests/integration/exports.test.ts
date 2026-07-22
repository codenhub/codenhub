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
  "./tw": { candidates: "btn", patterns: [/\.btn\{/] },
  "./tw/theme": { patterns: [/--color-primary:/] },
  "./tw/components": { candidates: "alert btn", patterns: [/\.alert\{/, /\.btn\{/] },
  "./tw/surface": { candidates: "empty-state", patterns: [/\.empty-state\{/] },
  "./tw/button": { candidates: "btn", patterns: [/\.btn\{/] },
  "./tw/form": { candidates: "ipt radio", patterns: [/\.ipt\{/, /\.radio\{/] },
  "./tw/feedback": { candidates: "alert progress", patterns: [/\.alert\{/, /\.progress\{/] },
  "./tw/loader": {
    candidates: "loader dots-wave",
    patterns: [/\.loader/, /\.dots-wave/, /mask-image:/],
  },
  "./tw/tooltip": { candidates: "tooltip", patterns: [/\.tooltip\{/] },
  "./tw/reset": { candidates: "text-body", patterns: [/:focus-visible\{/] },
  "./tw/native": { candidates: "btn", patterns: [/h1\{/, /button,/] },
  "./tw/typography": { candidates: "text-title", patterns: [/\.text-title\{/] },
  "./tw/utilities": { candidates: "stack table", patterns: [/\.stack\{/, /\.table\{/] },
};

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

test("compiled components expose every documented class group", async () => {
  const componentsCss = await readFile(path.resolve(packageRoot, "dist/components.css"), "utf8");

  for (const className of ["alert", "btn", "empty-state", "field", "loader", "text-title", "tooltip"]) {
    expect(componentsCss, `expected .${className} in compiled components`).toMatch(
      new RegExp(String.raw`\.${className}\{`),
    );
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
