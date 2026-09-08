import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const styles = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

describe("app-shell chrome stylesheet", () => {
  it("gives every header action a 44px minimum hit area", () => {
    const rule = styles.match(/\.shell-action\s*\{([^}]*)\}/)?.[1];

    expect(rule).toContain("min-height: 44px");
    expect(rule).toContain("min-width: 44px");
  });

  it("lays the header out as a single spaced row", () => {
    const rule = styles.match(/\.shell-header-content\s*\{([^}]*)\}/)?.[1];

    expect(rule).toContain("display: flex");
    expect(rule).toContain("justify-content: space-between");
  });

  it("keeps the footer at the bottom with a flex-column body", () => {
    const bodyRule = styles.match(/\.shell-body\s*\{([^}]*)\}/)?.[1];
    const footerRule = styles.match(/\.shell-footer\s*\{([^}]*)\}/)?.[1];

    expect(bodyRule).toContain("flex-direction: column");
    expect(bodyRule).toContain("min-height: 100dvh");
    expect(footerRule).toContain("margin-top: auto");
  });

  it("hides the resting theme icon at a specificity that clears the icon base rule", () => {
    // `@codenhub/icons` emits `i[class^="ic-"] { display: … }` after this sheet
    // through `virtual:icons.css`, so the hide rule needs two classes to win.
    expect(styles).toContain(".shell-theme-switch .shell-theme-icon-sun {\n  display: none;\n}");
  });

  it("wraps the nav links onto their own row on a narrow header", () => {
    const query = styles.match(/@media \(max-width: 40rem\) \{([\s\S]*?)\n\}/)?.[1];

    expect(query).toContain(".shell-nav {");
    expect(query).toContain("order: 3");
    expect(query).toContain("width: 100%");
  });
});
