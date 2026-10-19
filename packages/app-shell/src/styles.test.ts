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

  it("drops the actions to their own row on a narrow header, keeping DOM order visible", () => {
    const query = styles.match(/@media \(max-width: 40rem\) \{([\s\S]*?)\n\}/)?.[1];

    // The links stay on the brand's row and the actions wrap below, so the
    // rendered order still matches the DOM order (brand, links, actions) and
    // keyboard focus follows it.
    expect(query).toContain("flex-wrap: wrap");
    expect(query).toMatch(/\.shell-actions \{[^}]*width: 100%/s);
  });

  it("edges the search trigger with the shared input border and no 44px floor", () => {
    const rule = styles.match(/\.shell-search-trigger\s*\{([^}]*)\}/)?.[1];

    // It reads like the surfaces' package filter, and stays as tall as the
    // header's icon buttons rather than growing into a full form control.
    expect(rule).toContain("border: 1px solid var(--color-border)");
    expect(rule).not.toContain("44px");
  });

  it("keeps the search field at 16px so iOS does not zoom on focus", () => {
    const rule = styles.match(/\.shell-search-input\s*\{([^}]*)\}/)?.[1];

    expect(rule).toContain("font-size: 1rem");
  });
});
