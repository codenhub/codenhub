import {
  generateBaseCss,
  generateIconCss,
  getIconCssProps,
  getIconMaskUrl,
  IconRegistry,
  renderSvg,
} from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: lucide.prefix });
registry.registerFamily(lucide);

/**
 * Initializes icon CSS rules, theme toggle, and JS helper tests.
 */
function initPlayground(): void {
  // 1. Inject generated CSS rules for icons
  const styleEl = document.createElement("style");
  styleEl.id = "icons-generated-css";
  const testIcons = ["search", "check", "x", "settings", "user", "calendar", "arrow-right", "sun", "moon"];

  const cssChunks: string[] = [generateBaseCss({ prefix: "ic" })];

  for (const name of testIcons) {
    const resolved = registry.resolve(name);
    if (resolved) {
      cssChunks.push(generateIconCss([`.ic-${name}`], renderSvg(resolved)));
    }
  }

  styleEl.textContent = cssChunks.join("\n");
  document.head.appendChild(styleEl);

  // 2. Setup Theme Toggle (Light / Dark)
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const htmlEl = document.documentElement;
      const currentTheme = htmlEl.getAttribute("data-theme") ?? "dark";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";

      htmlEl.setAttribute("data-theme", nextTheme);
      htmlEl.classList.remove("dark", "light");
      htmlEl.classList.add(nextTheme);

      if (nextTheme === "dark") {
        themeToggleBtn.className = "btn out sm ic-moon";
        themeToggleBtn.textContent = "Dark Mode";
      } else {
        themeToggleBtn.className = "btn out sm ic-sun";
        themeToggleBtn.textContent = "Light Mode";
      }
    });
  }

  // 3. Test JS Helper getIconCssProps
  const dynamicIconEl = document.getElementById("js-dynamic-icon");
  if (dynamicIconEl) {
    const cssProps = getIconCssProps("check", registry);
    if (cssProps) {
      Object.entries(cssProps).forEach(([prop, value]) => {
        dynamicIconEl.style.setProperty(prop, value);
      });
      dynamicIconEl.className = "ic";
    }
  }

  // 4. Verify mask url helper
  const maskUrl = getIconMaskUrl("search", registry);

  const outputEl = document.getElementById("test-output");
  if (outputEl) {
    const success = Boolean(maskUrl && styleEl.textContent.includes("--ic-uri: url("));
    outputEl.innerHTML = success
      ? `<p style="color: var(--color-success, #4ade80); font-weight: bold; margin: 0;">✔ ${testIcons.length} icons generated &amp; CSS custom property mask assertions passed.</p>`
      : `<p style="color: var(--color-destructive, #f87171); font-weight: bold; margin: 0;">✖ Test playground initialization failed.</p>`;
  }
}

initPlayground();
