import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../dist/styles/index.css", import.meta.url), "utf8");
const forbiddenOutput = ["@layer base", "*,:before,:after", ":root,:host", ".fixed{"];
const match = forbiddenOutput.find((value) => css.includes(value));

if (match) {
  throw new Error(`Toast stylesheet contains unscoped generated CSS: ${match}`);
}
