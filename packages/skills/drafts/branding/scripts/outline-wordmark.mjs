// Sets a wordmark in a font file and writes it as an SVG of outlined paths, with no <text>.
// Usage: node outline-wordmark.mjs <font-file> <text> [--out wordmark.svg] [--size 100]
//   [--tracking=-10] [--pair AV=-20 ...] [--variation wght=700 ...] [--features=-liga ...]
// Write a negative value with an equals sign, as in --tracking=-10.
// Tracking and pair adjustments are in thousandths of an em, as in design tools.
// Prints the spacing record: each letter pair's kerning from the font, its adjustment, and the tracking.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import * as hb from "harfbuzzjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "wordmark.svg" },
    size: { type: "string", default: "100" },
    tracking: { type: "string", default: "0" },
    pair: { type: "string", multiple: true, default: [] },
    variation: { type: "string", multiple: true, default: [] },
    features: { type: "string", multiple: true, default: [] },
  },
});
const [fontFile, text] = positionals;
if (positionals.length !== 2 || !fontFile || !text) {
  throw new Error("Usage: node outline-wordmark.mjs <font-file> <text> [options]");
}

const number = (value, label) => {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new Error(`${label} must be a number: ${value}`);
  }
  return result;
};
const setting = (value, label) => {
  const match = value.match(/^(.+)=(.+)$/);
  if (!match) {
    throw new Error(`${label} must look like NAME=VALUE: ${value}`);
  }
  return [match[1], number(match[2], label)];
};

const size = number(values.size, "--size");
if (size <= 0) {
  throw new Error("--size must be greater than zero");
}
const tracking = number(values.tracking, "--tracking");
const pairs = new Map(values.pair.map((value) => setting(value, "--pair")));
const unusedPairs = new Set(pairs.keys());

const face = new hb.Face(new hb.Blob(readFileSync(fontFile)));
const font = new hb.Font(face);
const axes = face.getAxisInfos();
const variations = values.variation.map((value) => {
  const [tag, amount] = setting(value, "--variation");
  const axis = axes[tag];
  if (!axis) {
    throw new Error(`The font has no ${tag} axis. Axes: ${Object.keys(axes).join(", ") || "none"}`);
  }
  if (amount < axis.min || amount > axis.max) {
    throw new Error(`${tag} must be between ${axis.min} and ${axis.max}`);
  }
  return new hb.Variation(tag, amount);
});
font.setVariations(variations);

const shape = (extra) => {
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  hb.shape(
    font,
    buffer,
    [...values.features, ...extra].map((feature) => hb.Feature.fromString(feature)),
  );
  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  return infos.map((info, index) => ({ glyph: info.codepoint, cluster: info.cluster, ...positions[index] }));
};
const glyphs = shape([]);
const unkerned = shape(["-kern"]);
if (glyphs.some(({ glyph }) => glyph === 0)) {
  const missing = [...new Set(glyphs.filter(({ glyph }) => glyph === 0).map(({ cluster }) => text[cluster]))];
  throw new Error(`The font has no glyph for: ${missing.join(" ")}`);
}

const em = face.upem;
const scale = size / em;
const thousandths = (units) => Math.round((units / em) * 1000);
const round = (value) => Math.round(value * 100) / 100;
// Cluster offsets follow logical text order even when the glyphs run right to left.
const clusters = [...new Set(glyphs.map(({ cluster }) => cluster))].sort((a, b) => a - b);
const clusterEnds = new Map(clusters.map((cluster, index) => [cluster, clusters[index + 1] ?? text.length]));
const advances = (run) => {
  const result = new Map();
  for (const { cluster, xAdvance } of run) {
    result.set(cluster, (result.get(cluster) ?? 0) + xAdvance);
  }
  return result;
};
const kernedAdvances = advances(glyphs);
const unkernedAdvances = advances(unkerned);

const paths = [];
const record = [];
let pen = 0;
let box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
for (const [index, glyph] of glyphs.entries()) {
  const x = pen + glyph.xOffset;
  const y = glyph.yOffset;
  const outline = font.glyphToPath(glyph.glyph);
  if (outline) {
    paths.push(
      outline.replace(/([MLQCZ])([^MLQCZ]*)/g, (_, command, data) => {
        const coordinates = data.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
        const points = coordinates.map((value, position) =>
          position % 2 === 0 ? round((Number(value) + x) * scale) : round(-(Number(value) + y) * scale),
        );
        return command + points.join(" ");
      }),
    );
    const extents = font.glyphExtents(glyph.glyph);
    if (extents && extents.width !== 0) {
      box = {
        left: Math.min(box.left, (x + extents.xBearing) * scale),
        right: Math.max(box.right, (x + extents.xBearing + extents.width) * scale),
        top: Math.min(box.top, -(y + extents.yBearing) * scale),
        bottom: Math.max(box.bottom, -(y + extents.yBearing + extents.height) * scale),
      };
    }
  }
  pen += glyph.xAdvance;
  const next = glyphs[index + 1];
  if (next && next.cluster !== glyph.cluster) {
    const left = Math.min(glyph.cluster, next.cluster);
    const right = Math.max(glyph.cluster, next.cluster);
    const pair = text.slice(left, clusterEnds.get(right));
    const adjustment = pairs.get(pair) ?? 0;
    unusedPairs.delete(pair);
    record.push({
      pair,
      kerning: thousandths(kernedAdvances.get(glyph.cluster) - (unkernedAdvances.get(glyph.cluster) ?? 0)),
      adjustment,
    });
    pen += ((tracking + adjustment) / 1000) * em;
  }
}
if (unusedPairs.size > 0) {
  throw new Error(`These pairs are not in the text: ${[...unusedPairs].join(", ")}`);
}
if (paths.length === 0) {
  throw new Error("The text has no visible glyphs");
}

const viewBox = [box.left, box.top, box.right - box.left, box.bottom - box.top].map(round).join(" ");
writeFileSync(
  values.out,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n  <path d="${paths.join("")}"/>\n</svg>\n`,
);

// Name IDs 16 and 17 are the typographic family and style, 1 and 2 their legacy fallbacks. A variable
// font's style names its default instance, so it is left out when variations are set.
const family = face.getName(16, "en") || face.getName(1, "en");
const style = variations.length > 0 ? "" : face.getName(17, "en") || face.getName(2, "en");
const name = [family, style].filter(Boolean).join(" ");
const settings = variations.map(({ tag, value }) => `${tag} ${value}`).join(", ");
console.log(`Font: ${name || fontFile}${settings ? ` (${settings})` : ""}`);
console.log(`Tracking: ${tracking}/1000 em`);
console.log("Pair | Kerning from font | Adjustment (1/1000 em)");
for (const { pair, kerning, adjustment } of record) {
  console.log(`${pair} | ${kerning} | ${adjustment}`);
}
console.log(`Wrote ${values.out}`);
