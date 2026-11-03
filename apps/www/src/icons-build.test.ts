import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "astro";
import { beforeAll, describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));

const ICON_CLASS = /\bic-(?:lucide|simple-icons|logos)-[a-z0-9-]+/;

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

  // Svg mode inlines only literal `<i class="ic-…">` tags and emits no
  // stylesheet, so an icon class that reaches the page on any other element,
  // such as an `<i>` whose class was built from data, renders nothing. The
  // plugin cannot see such a class at build time, so nothing else reports it.
  it("inlines every icon the pages use as an svg", async () => {
    const html = await readAll(".html");

    const icons: string[] = [];
    const missed: string[] = [];
    for (const page of html) {
      // Only real tags: a README's code sample spells icon classes as escaped text.
      for (const [tag, name] of page.matchAll(/<([a-z][a-z0-9-]*)\s[^>]*\bclass="[^"]*"[^>]*>/gi)) {
        const icon = tag.match(ICON_CLASS)?.[0];
        if (icon === undefined) {
          continue;
        }
        (name.toLowerCase() === "svg" ? icons : missed).push(`${name} ${icon}`);
      }
    }

    expect(icons.length).toBeGreaterThan(0);
    expect([...new Set(missed)]).toEqual([]);
  });
});
