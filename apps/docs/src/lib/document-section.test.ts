import { describe, expect, it } from "vitest";

import { sectionOf } from "./document-section";

describe("sectionOf", () => {
  it("routes a hand-authored reference.md and a generated reference/ tree to reference", () => {
    expect(sectionOf({ relativePath: "reference.md" })).toBe("reference");
    expect(sectionOf({ relativePath: "reference/index.md" })).toBe("reference");
    expect(sectionOf({ relativePath: "reference/registries/browser.md" })).toBe("reference");
  });

  it("routes a changelog folder to changelog", () => {
    expect(sectionOf({ relativePath: "changelog/index.md" })).toBe("changelog");
    expect(sectionOf({ relativePath: "changelog/1.2.0.md" })).toBe("changelog");
    expect(sectionOf({ relativePath: "changelog.md" })).toBe("changelog");
  });

  it("routes the overview and every other page to guides", () => {
    expect(sectionOf({ relativePath: "index.md" })).toBe("guides");
    expect(sectionOf({ relativePath: "concepts.md" })).toBe("guides");
    expect(sectionOf({ relativePath: "usage/buttons.md" })).toBe("guides");
  });

  it("does not mistake a prefix match for a section folder", () => {
    expect(sectionOf({ relativePath: "reference-guide.md" })).toBe("guides");
    expect(sectionOf({ relativePath: "changelog-policy.md" })).toBe("guides");
  });
});
