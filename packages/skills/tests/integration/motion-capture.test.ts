import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, it } from "vitest";

it("should isolate a shorter render from the preceding frame sequence", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "motion-capture-"));
  try {
    const reference = fs.readFileSync(
      fileURLToPath(new URL("../../drafts/motion-graphics/references/gsap.md", import.meta.url)),
      "utf8",
    );
    const capture = [...reference.matchAll(/```js\r?\n([\s\S]*?)```/g)]
      .map((match) => match[1])
      .find((source) => source.includes('import { chromium } from "playwright";'));
    expect(capture).toBeDefined();

    // Keep the example's filesystem operations real; replace only browser capture.
    const browser = path.join(temporary, "browser.mjs");
    fs.writeFileSync(
      browser,
      `import { writeFile } from "node:fs/promises";
export const chromium = {
  async launch() {
    return {
      async newPage() {
        return {
          async goto(duration) { globalThis.window = { ready: true, duration: +duration, seek() {} }; },
          async waitForFunction(fn) { if (!fn()) throw new Error("Page not ready"); },
          async evaluate(fn, value) { return fn(value); },
          async screenshot({ path }) { await writeFile(path, String(window.duration)); }
        };
      },
      async close() {}
    };
  }
};
`,
    );
    const script = path.join(temporary, "capture.mjs");
    fs.writeFileSync(
      script,
      capture!.replace('from "playwright"', `from ${JSON.stringify(pathToFileURL(browser).href)}`),
    );
    for (const duration of [10, 5]) {
      execFileSync(process.execPath, [script, String(duration), "1"], { cwd: temporary, stdio: "pipe" });
    }

    const sequences = new Map<string, string[]>();
    for (const entry of fs.readdirSync(temporary, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".png")) {
        const frames = sequences.get(entry.parentPath) ?? [];
        frames.push(fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"));
        sequences.set(entry.parentPath, frames);
      }
    }
    expect([...sequences.values()].map((frames) => frames.length).sort((a, b) => a - b)).toEqual([5, 10]);
    for (const frames of sequences.values()) {
      expect(new Set(frames)).toEqual(new Set([String(frames.length)]));
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
