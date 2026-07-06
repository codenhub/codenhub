// Simple contrast check script using Playwright to evaluate actual colors in the browser
import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Go to vanilla preview URL
  await page.goto("http://localhost:5184/?env=vanilla");

  const toLinearRgbChannel = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

  const clampLinearRgb = (channel) => Math.min(1, Math.max(0, channel));

  const oklchToLinearRgb = ({ chroma, hue, lightness }) => {
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

  const parseColor = (color) => {
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

  const getRelativeLuminance = ({ blue, green, red }) => 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  const getContrast = (c1, c2) => {
    // If background is transparent, assume white background (or black if dark theme)
    let parsedBg;
    if (c2 === "rgba(0, 0, 0, 0)" || c2 === "transparent") {
      parsedBg = { blue: 1, green: 1, red: 1 }; // default to white background for contrast checks
    } else {
      parsedBg = parseColor(c2);
    }
    const l1 = getRelativeLuminance(parseColor(c1));
    const l2 = getRelativeLuminance(parsedBg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  const buttons = await page.evaluate(() => {
    const btnClasses = [
      "primary",
      "secondary",
      "success",
      "warning",
      "destructive",
      "info",
      "primary out",
      "secondary out",
      "success out",
      "warning out",
      "destructive out",
      "info out",
      "primary soft",
      "secondary soft",
      "success soft",
      "warning soft",
      "destructive soft",
      "info soft",
      "primary ghost",
      "secondary ghost",
      "success ghost",
      "warning ghost",
      "destructive ghost",
      "info ghost",
    ];

    // Evaluate light theme
    const results = [];
    for (const cls of btnClasses) {
      const btn = document.createElement("button");
      btn.className = `btn ${cls}`;
      btn.textContent = "Button";
      document.body.appendChild(btn);
      const style = getComputedStyle(btn);
      results.push({
        theme: "light",
        cls,
        bg: style.backgroundColor,
        fg: style.color,
        border: style.borderColor,
      });
      btn.remove();
    }

    // Evaluate dark theme
    const darkContainer = document.createElement("div");
    darkContainer.className = "dark";
    document.body.appendChild(darkContainer);
    for (const cls of btnClasses) {
      const btn = document.createElement("button");
      btn.className = `btn ${cls}`;
      btn.textContent = "Button";
      darkContainer.appendChild(btn);
      const style = getComputedStyle(btn);
      results.push({
        theme: "dark",
        cls,
        bg: style.backgroundColor,
        fg: style.color,
        border: style.borderColor,
      });
      btn.remove();
    }
    darkContainer.remove();
    return results;
  });

  console.log("--- BUTTON CONTRAST RATIOS ---");
  for (const b of buttons) {
    // If dark theme, and background is transparent, assume dark background
    let bg = b.bg;
    if (b.theme === "dark" && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
      // In dark theme, background is neutral-950 which is oklch(0.145 0 0) = #171717
      bg = "oklch(0.145 0 0)";
    }
    const contrast = getContrast(b.fg, bg);
    console.log(
      `[${b.theme.toUpperCase()}] .btn.${b.cls.padEnd(20)} | FG: ${b.fg.padEnd(20)} | BG: ${b.bg.padEnd(20)} | Contrast: ${contrast.toFixed(2)}:1 ${contrast >= 4.5 ? "✅ AA" : contrast >= 3 ? "⚠️ 3:1" : "❌ FAIL"}`,
    );
  }

  await browser.close();
}

try {
  await main();
} catch (err) {
  console.error(err);
}
