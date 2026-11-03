import { describe, expect, it } from "vitest";

import { decorative } from "./icon";

describe("decorative", () => {
  it("hides the icon from assistive technology", () => {
    const module = { svg: '<svg class="ic-lucide-tag" viewBox="0 0 24 24"><path d="M0 0" /></svg>' };

    expect(decorative(module)).toBe(
      '<svg aria-hidden="true" class="ic-lucide-tag" viewBox="0 0 24 24"><path d="M0 0" /></svg>',
    );
  });

  it("touches only the outer svg", () => {
    const module = { svg: '<svg class="ic-logos-bun"><svg></svg></svg>' };

    expect(decorative(module)).toBe('<svg aria-hidden="true" class="ic-logos-bun"><svg></svg></svg>');
  });
});
