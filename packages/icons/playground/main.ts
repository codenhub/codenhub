import { generateBaseCss, generateIconCss, getIcon } from "@codenhub/icons";

import "./style.css";

function initTestPlayground(): void {
  const styleEl = document.createElement("style");
  const testIcons = ["search", "check", "x", "settings"];

  const cssChunks: string[] = [generateBaseCss({ prefix: "ic" })];

  for (const name of testIcons) {
    const iconEntry = getIcon(name);
    if (iconEntry) {
      const svg = typeof iconEntry === "string" ? iconEntry : iconEntry.svg;
      cssChunks.push(generateIconCss([`.ic-${name}`], svg));
    }
  }

  styleEl.textContent = cssChunks.join("\n");
  document.head.appendChild(styleEl);

  const outputEl = document.getElementById("test-output");
  if (outputEl) {
    outputEl.innerHTML = `<p style="color: green; font-weight: bold;">✔ ${testIcons.length} test icon masks injected successfully.</p>`;
  }
}

initTestPlayground();
