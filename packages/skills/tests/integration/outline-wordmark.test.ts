import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, it } from "vitest";

// Replaces HarfBuzz with a font of 1000 units per em: every glyph is 500 wide, its outline a
// 400 by 700 box starting 50 units in, and the font kerns "AV" by -50. "?" has no glyph.
const harfbuzz = `
export class Blob {}
export class Variation { constructor(tag, value) { Object.assign(this, { tag, value }); } }
export const Feature = { fromString: (value) => value };
export class Face {
  upem = 1000;
  getAxisInfos() { return { wght: { min: 100, max: 900 } }; }
  getName(id) { return { 1: "Stub", 2: "Bold" }[id] ?? ""; }
}
export class Font {
  setVariations(variations) { this.variations = variations; }
  glyphToPath() { return "M50,0L450,0L450,700L50,700Z"; }
  glyphExtents() { return { xBearing: 50, yBearing: 700, width: 400, height: -700 }; }
}
export class Buffer {
  addText(text) { this.text = text; }
  guessSegmentProperties() {}
  getGlyphInfos() {
    const infos = [...this.text].map((char, cluster) => ({
      codepoint: char === "?" ? 0 : 1,
      cluster: char === "\u0301" ? cluster - 1 : cluster,
    }));
    return /^[\u0590-\u05ff]/.test(this.text) ? infos.reverse() : infos;
  }
  getGlyphPositions() { return this.positions; }
}
export const shape = (font, buffer, features) => {
  const kern = !features.includes("-kern");
  buffer.positions = [...buffer.text].map((char, index) => ({
    xAdvance: 500 + (kern && char === "A" && buffer.text[index + 1] === "V" ? -50 : 0),
    yAdvance: 0, xOffset: 0, yOffset: 0,
  }));
};
`;

const script = (skill: string) =>
  fs.readFileSync(
    fileURLToPath(new URL(`../../skills/${skill}/scripts/outline-wordmark.mjs`, import.meta.url)),
    "utf8",
  );

const outline = (...args: string[]) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "outline-wordmark-"));
  try {
    const stub = path.join(temporary, "harfbuzz.mjs");
    fs.writeFileSync(stub, harfbuzz);
    fs.writeFileSync(path.join(temporary, "font.ttf"), "");
    const copy = path.join(temporary, "outline-wordmark.mjs");
    fs.writeFileSync(
      copy,
      script("logo-design").replace('from "harfbuzzjs"', `from ${JSON.stringify(pathToFileURL(stub).href)}`),
    );
    const report = execFileSync(process.execPath, [copy, "font.ttf", ...args], {
      cwd: temporary,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { report, svg: fs.readFileSync(path.join(temporary, "wordmark.svg"), "utf8") };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};

it("should outline the text, apply kerning, tracking, and pair adjustments, and fit the viewBox", () => {
  const { report, svg } = outline("AVA", "--size", "1000", "--tracking=10", "--pair", "VA=-30");

  expect(svg).not.toContain("<text");
  // Pens: A at 0, V at 500 - 50 + 10 = 460, A at 460 + 500 + 10 - 30 = 940.
  expect(svg).toContain("M50 0L450 0L450 -700L50 -700Z");
  expect(svg).toContain("M510 0L910 0L910 -700L510 -700Z");
  expect(svg).toContain("M990 0L1390 0L1390 -700L990 -700Z");
  expect(svg).toContain('viewBox="50 -700 1340 700"');
  expect(report).toContain("Font: Stub Bold\n");
  expect(report).toContain("Tracking: 10/1000 em");
  expect(report).toContain("AV | -50 | 0");
  expect(report).toContain("VA | 0 | -30");
});

it.each([
  [["A?"], "The font has no glyph for: ?"],
  [["AV", "--pair", "XY=5"], "These pairs are not in the text: XY"],
  [["AV", "--variation", "wdth=80"], "The font has no wdth axis"],
  [["AV", "--variation", "wght=950"], "wght must be between 100 and 900"],
])("should refuse output it cannot outline as asked: %j", (args, message) => {
  expect(() => outline(...args)).toThrow(message);
});

it("should ship the same script in every skill that outlines lettering", () => {
  expect(script("branding")).toBe(script("logo-design"));
});

it("should name a variable font by family and settings, not by its default style", () => {
  expect(outline("AV", "--variation", "wght=600").report).toContain("Font: Stub (wght 600)\n");
});

it("should apply an adjustment to every occurrence of a pair", () => {
  const { report, svg } = outline("AVAV", "--size=1000", "--pair", "AV=-20");
  expect(report.match(/AV \| -50 \| -20/g)).toHaveLength(2);
  expect(svg).toContain('viewBox="50 -700 1760 700"');
});

it("should keep glyphs in a combining cluster together when tracking", () => {
  const { report, svg } = outline("A\u0301V", "--size=1000", "--tracking=100");
  expect(svg).toContain("M550 0L950 0L950 -700L550 -700Z");
  expect(report).toContain("A\u0301V | 0 | 0");
  expect(report.split(" | 0 | 0")).toHaveLength(2);
});

it("should name RTL pairs in logical text order", () => {
  const { report } = outline("אבג", "--pair", "אב=-20");
  expect(report).toContain("אב | 0 | -20");
  expect(report).toContain("בג | 0 | 0");
});

it.each(["0", "-10"])("should reject an unusable size: %s", (size) => {
  expect(() => outline("AV", `--size=${size}`)).toThrow("--size must be greater than zero");
});

it("should reject an unquoted multiword name rather than silently truncate it", () => {
  expect(() => outline("New", "Name")).toThrow("Usage:");
});

it.each(["inter/Inter-Variable.ttf", "monomaniac-one/MonomaniacOne-Regular.ttf"])(
  "should outline a repository font through the installed HarfBuzz: %s",
  (font) => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "outline-wordmark-font-"));
    try {
      const output = path.join(temporary, "wordmark.svg");
      const report = execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL("../../skills/logo-design/scripts/outline-wordmark.mjs", import.meta.url)),
          fileURLToPath(new URL(`../../../../assets/fonts/${font}`, import.meta.url)),
          "AVIVA",
          "--out",
          output,
          "--tracking=-10",
          "--pair",
          "AV=-20",
        ],
        { encoding: "utf8", stdio: "pipe" },
      );
      expect(report).toMatch(/AV \| -?\d+ \| -20/);
      expect(fs.readFileSync(output, "utf8")).toMatch(/<path d="M/);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  },
);
