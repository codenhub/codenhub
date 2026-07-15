interface LinearColor {
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

const clampLinearRgb = (channel: number) => Math.min(1, Math.max(0, channel));

const oklchToLinearRgb = ({
  chroma,
  hue,
  lightness,
}: {
  chroma: number;
  hue: number;
  lightness: number;
}): LinearColor => {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    blue: clampLinearRgb(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
    green: clampLinearRgb(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    red: clampLinearRgb(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
  };
};

const parseColor = (color: string): LinearColor => {
  const rgbMatch = color.match(/rgba?\(([^)]+)\)/);

  if (rgbMatch) {
    const [red = 0, green = 0, blue = 0] = rgbMatch[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(Number);

    return {
      blue: toLinearRgbChannel(blue / 255),
      green: toLinearRgbChannel(green / 255),
      red: toLinearRgbChannel(red / 255),
    };
  }

  const oklchMatch = color.match(/oklch\(([^)]+)\)/);

  if (oklchMatch) {
    const [lightness = 0, chroma = 0, hue = 0] = oklchMatch[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(Number);

    return oklchToLinearRgb({ chroma, hue, lightness });
  }

  throw new Error(`Unsupported color format: ${color}`);
};

const getRelativeLuminance = ({ blue, green, red }: LinearColor) => 0.2126 * red + 0.7152 * green + 0.0722 * blue;

export const getContrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = getRelativeLuminance(parseColor(foreground));
  const backgroundLuminance = getRelativeLuminance(parseColor(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};
