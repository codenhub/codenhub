import { describe, expect, it } from "vitest";

import { scanIconClasses } from "../src/scanner/class-scanner.js";

describe("scanIconClasses", () => {
  it("extracts icon classes from HTML string with default prefix", () => {
    const html = `
      <div class="container">
        <i class="ic-close size-24"></i>
        <button class="btn"><i class="ic-check"></i> Submit</button>
        <span class="ic-close"></span>
      </div>
    `;

    const extracted = scanIconClasses(html);
    expect(extracted).toBeInstanceOf(Set);
    expect(Array.from(extracted)).toEqual(["ic-close", "ic-check"]);
  });

  it("extracts icon classes from TSX/JSX template string", () => {
    const jsx = `
      export function Header() {
        return (
          <header className="header">
            <i className="ic-search text-blue" />
            <i className="ic-user" />
            <i className="ic-settings size-32" />
          </header>
        );
      }
    `;

    const extracted = scanIconClasses(jsx);
    expect(Array.from(extracted)).toEqual(["ic-search", "ic-user", "ic-settings"]);
  });

  it("supports custom prefix option", () => {
    const code = `<div class="icon-heart icon-star ic-close"></div>`;
    const extracted = scanIconClasses(code, { prefix: "icon" });

    expect(Array.from(extracted)).toEqual(["icon-heart", "icon-star"]);
  });

  it("returns empty set when no icon classes are present", () => {
    const code = `<div class="regular-class main-wrapper"></div>`;
    const extracted = scanIconClasses(code);

    expect(extracted.size).toBe(0);
  });
});
