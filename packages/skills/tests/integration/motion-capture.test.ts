import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, it } from "vitest";

const withCapture = (check: (temporary: string, script: string) => void) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "motion-capture-"));
  try {
    const reference = fs.readFileSync(
      fileURLToPath(new URL("../../skills/motion-graphics/references/gsap.md", import.meta.url)),
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
    if (process.env.CAPTURE_FAILURE === "launch") throw new Error("Launch failed");
    let captured = 0;
    return {
      async newPage() {
        return {
          async goto(duration) { globalThis.window = { ready: true, duration: +duration, seek() {} }; },
          async waitForFunction(fn) { if (!fn()) throw new Error("Page not ready"); },
          async evaluate(fn, value) { return fn(value); },
          async screenshot({ path }) {
            if (process.env.CAPTURE_FAILURE === "capture" && captured++ === 1) throw new Error("Capture failed");
            await writeFile(path, String(window.duration));
          }
        };
      },
      async close() { await writeFile("browser-closed", "closed"); }
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
    check(temporary, script);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};

it("should isolate shorter renders and report their directories and frame counts", () => {
  withCapture((temporary, script) => {
    for (const duration of [10, 5]) {
      const report = execFileSync(process.execPath, [script, String(duration), "1"], {
        cwd: temporary,
        encoding: "utf8",
        stdio: "pipe",
      });
      const match = report.trim().match(/^(\d+) frames written to (.+)$/);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBe(duration);
      const reportedDirectory = path.resolve(temporary, match![2]);
      expect(path.dirname(reportedDirectory)).toBe(temporary);
      expect(fs.readdirSync(reportedDirectory).filter((name) => name.endsWith(".png"))).toHaveLength(duration);
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
  });
});

it("should not add a frame when duration times fps lands just above a whole number", () => {
  withCapture((temporary, script) => {
    // 2.2 * 25 is 55.00000000000001 in floating point.
    const report = execFileSync(process.execPath, [script, "2.2", "25"], {
      cwd: temporary,
      encoding: "utf8",
      stdio: "pipe",
    });
    expect(report.trim()).toMatch(/^55 frames written to /);
  });
});

it.each(["launch", "capture"])("should remove failed output and release the browser: %s", (failure) => {
  withCapture((temporary, script) => {
    expect(() =>
      execFileSync(process.execPath, [script, "10", "1"], {
        cwd: temporary,
        stdio: "pipe",
        env: { ...process.env, CAPTURE_FAILURE: failure },
      }),
    ).toThrow(failure === "launch" ? "Launch failed" : "Capture failed");
    expect(fs.readdirSync(temporary).filter((name) => name.startsWith("frames-"))).toEqual([]);
    expect(fs.existsSync(path.join(temporary, "browser-closed"))).toBe(failure === "capture");
  });
});
