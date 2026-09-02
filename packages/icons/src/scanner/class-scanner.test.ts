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

  it("expands a glob into the files it names", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-scan-glob-"));
    fs.writeFileSync(path.join(tmpDir, "page.html"), '<div class="ic-close"></div>');
    fs.writeFileSync(path.join(tmpDir, "widget.tsx"), '<i className="ic-user" />');
    fs.writeFileSync(path.join(tmpDir, "notes.md"), "ic-ignored-extension");

    const result = scanFiles([path.join(tmpDir, "*.{html,tsx}")]);

    expect(Array.from(result).toSorted()).toEqual(["ic-close", "ic-user"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("expands a recursive glob into nested files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-scan-deep-"));
    fs.mkdirSync(path.join(tmpDir, "components", "nested"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "components", "nested", "card.html"), '<i class="ic-star"></i>');

    const result = scanFiles([path.join(tmpDir, "**", "*.html")]);

    expect(Array.from(result)).toEqual(["ic-star"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads a literal path before treating it as a pattern", () => {
    // A real file whose name carries a bracket is a path, not a glob.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-scan-literal-"));
    const bracketed = path.join(tmpDir, "page[1].html");
    fs.writeFileSync(bracketed, '<div class="ic-close"></div>');

    expect(Array.from(scanFiles([bracketed]))).toEqual(["ic-close"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ignores a glob that matches nothing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-scan-empty-"));

    expect(scanFiles([path.join(tmpDir, "**", "*.html")]).size).toBe(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should extract stroke modifiers, including floats", () => {
    const html = '<button class="ic-close ic-close/1.5 ic-user/2 ic-user/3.75"></button>';
    const found = scanIconClasses(html);
    expect(Array.from(found)).toContain("ic-close/1.5");
    expect(Array.from(found)).toContain("ic-user/2");
    expect(Array.from(found)).toContain("ic-user/3.75");
    expect(Array.from(found)).toContain("ic-close");
  });
});
