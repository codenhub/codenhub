/**
 * Compiles every generated icon family into a published module.
 *
 * Families live in the repository as one JSON document each, which keeps an
 * upstream bump to a single reviewable diff. Consumers import them as modules,
 * so the build turns each document into `dist/data/<prefix>.js` and its
 * declaration.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = resolve(packageDirectory, "data");
const outputDirectory = resolve(packageDirectory, "dist", "data");

const DECLARATION = `import type { IconFamilyData } from "../index.js";

declare const family: IconFamilyData;
export default family;
`;

async function readFamilies() {
  const entries = await readdir(dataDirectory, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function buildFamily(prefix) {
  const document = await readFile(resolve(dataDirectory, prefix, "icons.json"), "utf8");
  await writeFile(resolve(outputDirectory, `${prefix}.js`), `export default ${document.trim()};\n`, "utf8");
  await writeFile(resolve(outputDirectory, `${prefix}.d.ts`), DECLARATION, "utf8");
}

const families = await readFamilies();
if (families.length === 0) {
  console.warn("No icon family data found. Run `pnpm generate icons` first.");
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(families.map(buildFamily));

console.log(`Built ${families.length} icon family module(s).`);
