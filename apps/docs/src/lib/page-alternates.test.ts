import { describe, expect, it } from "vitest";

import { pageAlternates } from "./page-alternates";

describe("pageAlternates", () => {
  it("names every version and points x-default at the English page", () => {
    expect(
      pageAlternates({ route: "/error/setup/" }, [
        { lang: "pt-BR", route: "/pt-BR/error/setup/" },
        { lang: "es", route: "/es/error/setup/" },
      ]),
    ).toEqual([
      { lang: "en", route: "/error/setup/" },
      { lang: "pt-BR", route: "/pt-BR/error/setup/" },
      { lang: "es", route: "/es/error/setup/" },
      { lang: "x-default", route: "/error/setup/" },
    ]);
  });

  it("names no alternates for a page without a translation", () => {
    expect(pageAlternates({ route: "/error/setup/" }, [])).toEqual([]);
  });
});
