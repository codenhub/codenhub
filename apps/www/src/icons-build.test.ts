import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "astro";
import { beforeAll, describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));

const ICON_CLASS = /\bic-(?:lucide|simple-icons|logos)-[a-z0-9-]+/g;

async function readAll(extension: string): Promise<string[]> {
  const entries = await readdir(distRoot, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => `${entry.parentPath}/${entry.name}`);
  return Promise.all(paths.map((path) => readFile(path, "utf8")));
}

describe("icon delivery", () => {
  beforeAll(async () => {
    await build({ logLevel: "silent", root: appRoot });
  }, 120_000);

  // CSS mode builds its stylesheet before Astro bundles client scripts, so a
  // class named only in a `<script>` gets no rule and renders as a solid square
  // (apps/docs hit this in its link preview). Nothing in the build reports it.
  it("generates a mask rule for every icon class the pages or their scripts use", async () => {
    const [html, scripts, styles] = await Promise.all([readAll(".html"), readAll(".js"), readAll(".css")]);
    const css = styles.join("\n");

    const used = new Set<string>();
    const inlineScripts: string[] = [];
    // Only real `class` attributes and scripts: a README's code sample spells
    // icon classes as text. Astro inlines a small client script into the page.
    for (const page of html) {
      for (const [, value] of page.matchAll(/\sclass="([^"]*)"/g)) {
        for (const [name] of value.matchAll(ICON_CLASS)) {
          used.add(name);
        }
      }
      for (const [, body] of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        inlineScripts.push(body);
      }
    }
    for (const script of [...scripts, ...inlineScripts]) {
      for (const [name] of script.matchAll(ICON_CLASS)) {
        used.add(name);
      }
    }

    const missing = [...used].filter((name) => !new RegExp(`\\.${name}(?![a-z0-9-])`).test(css));

    expect(used.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
