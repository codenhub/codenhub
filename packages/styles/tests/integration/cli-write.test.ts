/* How the build writes its temporary file, observed through `fs.open`: a test
   cannot plant a link at a name the build picks at random, so it checks that
   the file is opened in a way no planted entry survives. */
import type * as FsPromises from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The `open` the build calls, swapped per test; every other call goes to Node.js.
const fsMock = vi.hoisted(() => ({ open: undefined as unknown as typeof FsPromises.open }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();

  fsMock.open = actual.open;

  return { ...actual, open: (...args: Parameters<typeof actual.open>) => fsMock.open(...args) };
});

const { open: realOpen } = await vi.importActual<typeof FsPromises>("node:fs/promises");
const { run } = await import("../../src/cli/run");

let project: string;
let stderr: string[];
let opened: { file: string; flags: unknown }[];

beforeEach(async () => {
  project = await mkdtemp(path.join(tmpdir(), "chs-cli-write-"));
  await mkdir(path.join(project, "app"));
  await writeFile(path.join(project, "app", "show.html"), '<button class="btn">Save</button>\n');
  stderr = [];
  opened = [];
  fsMock.open = (async (file: string, flags?: unknown, mode?: unknown) => {
    opened.push({ file: String(file), flags });
    return realOpen(file, flags as string, mode as number);
  }) as typeof fsMock.open;
});

afterEach(async () => {
  await rm(project, { force: true, recursive: true });
});

function build(): Promise<number> {
  return run(["build", "-c", "app/*.html", "-o", "app.css"], {
    cwd: project,
    nodeVersion: process.versions.node,
    stdout: () => undefined,
    stderr: (line) => stderr.push(line),
  });
}

const temporaries = () => opened.filter(({ file }) => file.endsWith(".tmp"));

describe("the temporary file", () => {
  it("is created exclusively, under a name no one can guess", async () => {
    expect(await build()).toBe(0);
    expect(await build()).toBe(0);

    const [first, second] = temporaries();

    expect(first?.flags).toBe("wx");
    expect(path.basename(first?.file ?? "")).toMatch(/^app\.css\.[0-9a-f]{16,}\.tmp$/);
    expect(first?.file).not.toBe(second?.file);
    expect(first?.file).not.toContain(String(process.pid));
  });

  // What a planted entry, or a temporary file another build left, at the name picked looks like.
  it("takes another name when one is taken, and leaves the entry there", async () => {
    let taken = "";

    fsMock.open = (async (file: string, flags?: unknown) => {
      opened.push({ file: String(file), flags });
      if (String(file).endsWith(".tmp") && taken === "") {
        taken = String(file);
        await writeFile(taken, "someone else's");
        return realOpen(taken, "wx");
      }
      return realOpen(file, flags as string);
    }) as typeof fsMock.open;

    expect(await build()).toBe(0);
    expect(temporaries()).toHaveLength(2);
    expect(await readFile(taken, "utf8")).toBe("someone else's");
    expect(await readFile(path.join(project, "app.css"), "utf8")).toMatch(/\.btn\b/);
  });

  // The previous stylesheet stays whole, and the message names the --output, not the temporary file.
  it("is removed when the write fails, leaving the previous stylesheet whole", async () => {
    await writeFile(path.join(project, "app.css"), "/*! @codenhub/styles | previous */");

    fsMock.open = (async (file: string, flags?: unknown) => {
      const handle = await realOpen(file, flags as string);

      if (String(file).endsWith(".tmp")) {
        (handle as { writeFile: FileHandle["writeFile"] }).writeFile = () =>
          Promise.reject(
            Object.assign(new Error(`ENOSPC: no space left on device, write '${String(file)}'`), { code: "ENOSPC" }),
          );
      }
      return handle;
    }) as typeof fsMock.open;

    expect(await build()).toBe(1);
    expect(stderr).toEqual([
      "chs: cannot write --output app.css: no space left on device (ENOSPC); free some space, or name a file on another disk.",
    ]);
    expect(await readFile(path.join(project, "app.css"), "utf8")).toBe("/*! @codenhub/styles | previous */");
    expect((await readdir(project)).sort()).toEqual(["app", "app.css"]);
  });
});
