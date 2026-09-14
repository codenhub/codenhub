import { describe, expect, it } from "vitest";

import { resolveNavLinks } from "./nav.ts";

describe("resolveNavLinks", () => {
  it("includes Hub, Documentation, and Demo when every URL is set", () => {
    expect(
      resolveNavLinks({
        demoUrl: "https://demo.codenhub.dev",
        docsUrl: "https://docs.codenhub.dev",
        wwwUrl: "https://codenhub.dev",
      }),
    ).toEqual([
      { href: "https://codenhub.dev", label: "Hub" },
      { href: "https://docs.codenhub.dev", label: "Documentation" },
      { href: "https://demo.codenhub.dev", label: "Demo" },
    ]);
  });

  it("omits a link whose URL is unset", () => {
    expect(resolveNavLinks({ docsUrl: "https://docs.codenhub.dev", wwwUrl: "https://codenhub.dev" })).toEqual([
      { href: "https://codenhub.dev", label: "Hub" },
      { href: "https://docs.codenhub.dev", label: "Documentation" },
    ]);
  });

  it("returns an empty array when no URL is set", () => {
    expect(resolveNavLinks({})).toEqual([]);
  });

  it("keeps Hub, Documentation, Demo order regardless of input key order", () => {
    expect(
      resolveNavLinks({
        wwwUrl: "https://codenhub.dev",
        demoUrl: "https://demo.codenhub.dev",
      }),
    ).toEqual([
      { href: "https://codenhub.dev", label: "Hub" },
      { href: "https://demo.codenhub.dev", label: "Demo" },
    ]);
  });
});
