import { describe, expect, it } from "vitest";

import { decorative } from "./icon";

describe("decorative", () => {
  it("adds aria-hidden and the icon class the base rules size", () => {
    const module = {
      icon: { prefix: "lucide", iconName: "tag" },
      svg: '<svg viewBox="0 0 24 24"><path d="M0 0" /></svg>',
    };

    expect(decorative(module)).toBe(
      '<svg aria-hidden="true" class="ic-lucide-tag" viewBox="0 0 24 24"><path d="M0 0" /></svg>',
    );
  });

  it("touches only the outer svg", () => {
    const module = { icon: { prefix: "logos", iconName: "bun" }, svg: "<svg><svg></svg></svg>" };

    expect(decorative(module)).toBe('<svg aria-hidden="true" class="ic-logos-bun"><svg></svg></svg>');
  });
});
