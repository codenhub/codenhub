import { describe, expect, it } from "vitest";

import {
  createWaves,
  disturbWaves,
  fieldValue,
  GLYPH_RAMP,
  glyphFor,
  RIPPLE_LIFETIME,
  rippleLift,
  stepWaves,
  waveLift,
} from "./ascii-field";

describe("ascii field", () => {
  it("keeps every field value inside [0, 1]", () => {
    const origin = { x: 40, y: 12 };
    for (let x = 0; x < 120; x += 7) {
      for (let y = 0; y < 40; y += 3) {
        for (const time of [0, 1.3, 47.9]) {
          const value = fieldValue(x, y, time, origin);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("maps the ends of the range to the ends of the ramp", () => {
    expect(glyphFor(0)).toBe(GLYPH_RAMP.at(0));
    expect(glyphFor(1)).toBe(GLYPH_RAMP.at(-1));
  });

  it("clamps values outside the range instead of returning nothing", () => {
    expect(glyphFor(-3)).toBe(GLYPH_RAMP.at(0));
    expect(glyphFor(9)).toBe(GLYPH_RAMP.at(-1));
  });

  it("moves a ripple's ring outward and lets it fade out", () => {
    const ripple = { x: 0, y: 0, start: 0 };
    // At 0.5s the front is 14 cells out along the row.
    expect(rippleLift(14, 0, 0.5, [ripple])).toBeGreaterThan(0.6);
    expect(rippleLift(0, 0, 0.5, [ripple])).toBeLessThan(0.001);
    expect(rippleLift(RIPPLE_LIFETIME * 28, 0, RIPPLE_LIFETIME, [ripple])).toBe(0);
  });

  it("spreads a disturbance to its neighbours, then lets it settle", () => {
    const waves = createWaves(20, 20);
    disturbWaves(waves, { x: 10, y: 10 }, 1);
    expect(waveLift(waves, 15, 10)).toBe(0);

    for (let step = 0; step < 4; step += 1) {
      stepWaves(waves);
    }
    expect(waveLift(waves, 13, 10)).toBeGreaterThan(0);

    for (let step = 0; step < 400; step += 1) {
      stepWaves(waves);
    }
    expect(waveLift(waves, 10, 10)).toBeLessThan(0.01);
  });

  it("clips a disturbance at the grid's edge", () => {
    const waves = createWaves(4, 4);
    expect(() => disturbWaves(waves, { x: -1, y: 5 }, 1, 3)).not.toThrow();
    expect(waveLift(waves, 0, 3)).toBeGreaterThan(0);
  });
});
