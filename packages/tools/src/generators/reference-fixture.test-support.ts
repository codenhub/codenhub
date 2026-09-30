import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";

/**
 * Writes a minimal opted-in package with a single `.` entrypoint to a temp directory.
 * @param name Unscoped fixture name; the package is `@codenhub/<name>`.
 * @param sources Source files keyed by path under `src/`; `index.ts` is the entrypoint.
 * @returns The fixture as a workspace package, ready for `analyzeReference`.
 */
export async function createReferenceFixture(name: string, sources: Record<string, string>): Promise<WorkspacePackage> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-reference-"));
  const manifest = {
    name: `@codenhub/${name}`,
    version: "1.0.0",
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    codenhub: { docs: { label: "Fixture", status: "active", reference: {} } },
  };
  await writeFile(join(directory, "package.json"), JSON.stringify(manifest, null, 2));
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "Preserve",
          moduleResolution: "bundler",
          lib: ["ES2024"],
          strict: true,
          composite: true,
          noEmit: true,
        },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
  );
  await Promise.all(
    Object.entries(sources).map(async ([relative, contents]) => {
      const path = join(directory, "src", relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }),
  );
  return {
    directory,
    directoryName: name,
    isPrivate: false,
    location: name,
    manifest,
    name: manifest.name,
    scripts: {},
    unscopedName: name,
    workspaceDependencies: [],
  };
}
