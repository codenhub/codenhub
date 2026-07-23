import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scanFiles, scanIconClasses } from "./class-scanner.js";

describe("class-scanner", () => {
  it("should extract ic-* classes from HTML string", () => {
    const html = '<button class="btn ic-close ic-search"></button>';
    const found = scanIconClasses(html);
    expect(Array.from(found)).toEqual(["ic-close", "ic-search"]);
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

  it("should support custom prefix", () => {
    const html = '<div class="icon-heart icon-star ic-close"></div>';
    const found = scanIconClasses(html, { prefix: "icon" });
    expect(Array.from(found)).toEqual(["icon-heart", "icon-star"]);
  });

  it("should return empty set when no icon classes found", () => {
    const html = '<div class="normal-class"></div>';
    const found = scanIconClasses(html);
    expect(found.size).toBe(0);
  });

  it("should scan multiple files on disk with scanFiles", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-scan-test-"));
    const file1 = path.join(tmpDir, "page1.html");
    const file2 = path.join(tmpDir, "page2.jsx");

    fs.writeFileSync(file1, '<div class="ic-close ic-home"></div>');
    fs.writeFileSync(file2, '<span className="ic-user"></span>');

    const result = scanFiles([file1, file2, path.join(tmpDir, "nonexistent.html")]);
    expect(Array.from(result)).toEqual(["ic-close", "ic-home", "ic-user"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
