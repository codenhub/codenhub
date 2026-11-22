/**
 * Writes the languages the text tracking stays off for, from
 * `lib/script-languages.mjs`, into the three stylesheets that repeat them,
 * between their `generated: script-languages` markers: the type scale, the
 * bare passages of `/native`, and chunky tile's solo class.
 *
 * Run by this package's `generate` script. `--dry-run` reports a stale copy
 * without writing it and exits non-zero, which the CI drift gate checks.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyGenerated } from "@codenhub/tools/generators";

import { CLDR_VERSION, ICU_VERSION, untrackedLanguages } from "./lib/script-languages.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const FILES = ["src/typography.rules.css", "src/native.css", "src/aesthetics/chunky-tile.css"];
const REGION =
  /^(?<indent>[ \t]*)\/\* generated: script-languages start \*\/$[\s\S]*?^[ \t]*\/\* generated: script-languages end \*\/$/m;

const isDryRun = process.argv.includes("--dry-run");
const languages = untrackedLanguages();

const region = (indent) =>
  [
    "/* generated: script-languages start */",
    `/* CLDR ${CLDR_VERSION}, through ICU ${ICU_VERSION}; run \`pnpm generate styles\`. */`,
    ...languages.map((tag, index) => `:lang(${tag})${index < languages.length - 1 ? "," : ""}`),
    "/* generated: script-languages end */",
  ]
    .map((line) => indent + line)
    .join("\n");

const files = await Promise.all(
  FILES.map(async (file) => {
    const source = (await readFile(path.join(packageRoot, file), "utf8")).replaceAll("\r\n", "\n");
    const match = REGION.exec(source);
    if (!match) {
      throw new Error(`${file} has no "script-languages" generated region.`);
    }
    return { contents: source.replace(REGION, () => region(match.groups.indent)), path: file };
  }),
);

const outcomes = await applyGenerated(files, { dryRun: isDryRun, root: packageRoot });

for (const {
  file: { path: file },
  hasDrift,
} of outcomes) {
  console.log(
    isDryRun
      ? `${file}'s languages are ${hasDrift ? "out of date" : "up to date"}.`
      : `${file}'s languages ${hasDrift ? "written" : "are already up to date"}.`,
  );
}
if (isDryRun && outcomes.some(({ hasDrift }) => hasDrift)) {
  process.exitCode = 1;
}
