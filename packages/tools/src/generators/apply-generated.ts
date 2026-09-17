import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { hasContentDrift, type GeneratedFile } from "./generator.ts";

/** One generated file compared against what is currently on disk. */
export interface GeneratedOutcome {
  /** The file as the generator produced it. */
  file: GeneratedFile;
  /** Whether its contents differ from what is on disk, or the file does not exist yet. */
  hasDrift: boolean;
}

/** Options for {@link applyGenerated}. */
export interface ApplyGeneratedOptions {
  /** Absolute directory `file.path` is resolved against. */
  root: string;
  /** Report drift without writing. Defaults to `false`. */
  dryRun?: boolean;
}

/**
 * Diffs generated files against disk and, unless `dryRun` is set, writes the
 * ones that drifted.
 *
 * This is the one place that decides a generated file needs writing, so a
 * generator — whether run in-process or as a package's own script — reports
 * contents and never reimplements diffing, directory creation, or `--dry-run`
 * itself.
 * @param files Files a generator produced.
 * @param options Root to resolve paths against, and whether to skip writing.
 * @returns Each file paired with whether it had drifted.
 */
export async function applyGenerated(
  files: readonly GeneratedFile[],
  options: ApplyGeneratedOptions,
): Promise<GeneratedOutcome[]> {
  const outcomes = await Promise.all(
    files.map(async (file): Promise<GeneratedOutcome> => {
      const authored = await readFile(resolve(options.root, file.path), "utf8").catch(() => undefined);
      return { file, hasDrift: authored === undefined || hasContentDrift(file.contents, authored) };
    }),
  );

  if (options.dryRun) {
    return outcomes;
  }

  await Promise.all(
    outcomes
      .filter(({ hasDrift }) => hasDrift)
      .map(async ({ file }) => {
        // A generator may own a file in a directory that does not exist yet,
        // such as the first build of a new icon family.
        const target = resolve(options.root, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.contents, "utf8");
      }),
  );

  return outcomes;
}
