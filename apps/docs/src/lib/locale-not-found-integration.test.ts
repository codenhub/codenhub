import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moveLocaleNotFoundPages } from "./locale-not-found-integration";

describe("moveLocaleNotFoundPages", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "docs-404-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("puts each locale's page where the deployment looks for it", async () => {
    await mkdir(path.join(root, "pt-BR", "404"), { recursive: true });
    await writeFile(path.join(root, "pt-BR", "404", "index.html"), "Página não encontrada");
    await mkdir(path.join(root, "pt-BR", "error"), { recursive: true });

    await moveLocaleNotFoundPages(root, ["pt-BR", "es"]);

    expect(await readFile(path.join(root, "pt-BR", "404.html"), "utf8")).toBe("Página não encontrada");
    expect((await readdir(path.join(root, "pt-BR"))).sort()).toEqual(["404.html", "error"]);
  });
});
