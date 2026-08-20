import { expect } from "@playwright/test";

interface LinearColor {
  alpha: number;
  blue: number;
  green: number;
  red: number;
}

export interface SrgbColor {
  alpha: number;
  blue: number;
  green: number;
  red: number;
}

export interface ButtonIntentToken {
  className: string;
  tokenName: string;
}

export const BUTTON_INTENT_TOKENS = [
  { className: "primary", tokenName: "primary" },
  { className: "secondary", tokenName: "accent" },
  { className: "success", tokenName: "success" },
  { className: "warning", tokenName: "warning" },
  { className: "destructive", tokenName: "destructive" },
  { className: "info", tokenName: "info" },
] as const satisfies readonly ButtonIntentToken[];

const toLinearRgbChannel = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const toGammaRgbChannel = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

const clampLinearRgb = (channel: number) => Math.min(1, Math.max(0, channel));

const parseComponents = (body: string) =>
  body
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map((component) => (component === "none" ? 0 : Number.parseFloat(component)));

const parseAlpha = (components: number[], index: number) => {
  const alpha = components[index];

  return alpha === undefined || Number.isNaN(alpha) ? 1 : alpha;
};

const oklabToLinearRgb = ({ a, b, lightness }: { a: number; b: number; lightness: number }) => {
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    blue: clampLinearRgb(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
    green: clampLinearRgb(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    red: clampLinearRgb(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
  };
};

/* Computed colors reach the tests in whichever space the browser resolved them
   in. Tokens stay `oklch`, `color-mix(in oklab, ...)` results serialize as
   `oklab()` or `color(srgb ...)` depending on the engine, and untouched values
   stay `rgb()`. Every form is normalized here so tests compare colors rather
   than the syntax a browser happened to pick. */
const parseColor = (color: string): LinearColor => {
  const rgbMatch = color.match(/rgba?\(([^)]+)\)/);

  if (rgbMatch) {
    const [red = 0, green = 0, blue = 0, ...rest] = parseComponents(rgbMatch[1]);

    return {
      alpha: parseAlpha(rest, 0),
      blue: toLinearRgbChannel(blue / 255),
      green: toLinearRgbChannel(green / 255),
      red: toLinearRgbChannel(red / 255),
    };
  }

  const srgbMatch = color.match(/color\(srgb\s+([^)]+)\)/);

  if (srgbMatch) {
    const [red = 0, green = 0, blue = 0, ...rest] = parseComponents(srgbMatch[1]);

    return {
      alpha: parseAlpha(rest, 0),
      blue: toLinearRgbChannel(clampLinearRgb(blue)),
      green: toLinearRgbChannel(clampLinearRgb(green)),
      red: toLinearRgbChannel(clampLinearRgb(red)),
    };
  }

  const oklabMatch = color.match(/(?:color\(oklab|oklab\()\s*([^)]+)\)/);

  if (oklabMatch) {
    const [lightness = 0, a = 0, b = 0, ...rest] = parseComponents(oklabMatch[1]);

    return { alpha: parseAlpha(rest, 0), ...oklabToLinearRgb({ a, b, lightness }) };
  }

  const oklchMatch = color.match(/oklch\(([^)]+)\)/);

  if (oklchMatch) {
    const [lightness = 0, chroma = 0, hue = 0, ...rest] = parseComponents(oklchMatch[1]);
    const hueRadians = (hue * Math.PI) / 180;

    return {
      alpha: parseAlpha(rest, 0),
      ...oklabToLinearRgb({
        a: chroma * Math.cos(hueRadians),
        b: chroma * Math.sin(hueRadians),
        lightness,
      }),
    };
  }

  if (color === "transparent") {
    return { alpha: 0, blue: 0, green: 0, red: 0 };
  }

  throw new Error(`Unsupported color format: ${color}`);
};

/** Normalizes any computed color to 8-bit sRGB channels with its alpha. */
export const readSrgb = (color: string): SrgbColor => {
  const { alpha, blue, green, red } = parseColor(color);

  return {
    alpha,
    blue: Math.round(toGammaRgbChannel(blue) * 255),
    green: Math.round(toGammaRgbChannel(green) * 255),
    red: Math.round(toGammaRgbChannel(red) * 255),
  };
};

/** Largest per-channel difference between two colors, in 8-bit sRGB steps. */
export const getColorDistance = (left: string, right: string) => {
  const first = readSrgb(left);
  const second = readSrgb(right);

  return Math.max(
    Math.abs(first.red - second.red),
    Math.abs(first.green - second.green),
    Math.abs(first.blue - second.blue),
    Math.abs(first.alpha - second.alpha) * 255,
  );
};

export const isTransparent = (color: string) => readSrgb(color).alpha === 0;

/* An intent that caps its fill paints a translucent background, so what a reader
   sees is the fill composited over whatever is behind it. Measuring contrast
   against the declared colour instead reports the ratio of a colour against
   itself -- 1.00 -- for a neutral component that is in fact perfectly legible.
   Tests that measure a capped fill flatten it first. */
export const flattenColor = (color: string, ground: string) => {
  const top = readSrgb(color);
  const bottom = readSrgb(ground);

  if (bottom.alpha !== 1) {
    throw new Error(`Expected an opaque ground, got ${ground}`);
  }

  const composite = (channel: "blue" | "green" | "red") =>
    Math.round(top[channel] * top.alpha + bottom[channel] * (1 - top.alpha));

  return `rgb(${composite("red")} ${composite("green")} ${composite("blue")})`;
};

const getRelativeLuminance = ({ blue, green, red }: LinearColor) => 0.2126 * red + 0.7152 * green + 0.0722 * blue;

export const getContrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = getRelativeLuminance(parseColor(foreground));
  const backgroundLuminance = getRelativeLuminance(parseColor(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};

/* Presentation and intent resolve colors through `color-mix`, so a computed
   value carries the same color as its token in a different syntax, and can land
   a rounding step away in 8-bit sRGB. Colors are compared by distance. */
export const expectSameColor = (actual: string, expected: string, label: string) => {
  expect(getColorDistance(actual, expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(2);
};
