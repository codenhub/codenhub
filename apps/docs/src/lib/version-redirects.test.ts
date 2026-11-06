import { describe, expect, it } from "vitest";

import { findVersionRedirect } from "./version-redirect-target";
import { buildVersionRedirects } from "./version-redirects";

describe("buildVersionRedirects", () => {
  it("sends each release the site does not serve to its line's kept version or the current one", () => {
    expect(
      buildVersionRedirects([
        {
          archived: ["1.4.3"],
          current: "2.1.0",
          slug: "error",
          versions: ["1.4.2", "1.4.3", "2.0.0", "2.1.0", "3.0.0-beta.1"],
        },
        { archived: [], current: "0.1.0", slug: "jwt", versions: [] },
      ]),
    ).toEqual({ error: { "1.4.2": "error/1.4.3", "2.0.0": "error", "2.1.0": "error" } });
  });
});

describe("findVersionRedirect", () => {
  const redirects = { error: { "0.4.2": "error/0.4.3", "0.9.0": "error" } };
  const locales = ["es", "pt-BR"];

  it("keeps the page path and the trailing slash", () => {
    expect(findVersionRedirect("/error/0.4.2/guides/setup/", redirects, locales)).toBe("/error/0.4.3/guides/setup/");
    expect(findVersionRedirect("/error/0.4.2/", redirects, locales)).toBe("/error/0.4.3/");
    expect(findVersionRedirect("/error/0.4.2", redirects, locales)).toBe("/error/0.4.3");
  });

  it("sends the current version's number to the unversioned route", () => {
    expect(findVersionRedirect("/error/0.9.0/guides/", redirects, locales)).toBe("/error/guides/");
  });

  it("keeps a locale prefix", () => {
    expect(findVersionRedirect("/pt-BR/error/0.4.2/guides/", redirects, locales)).toBe("/pt-BR/error/0.4.3/guides/");
  });

  it("leaves a path that names no unserved release", () => {
    expect(findVersionRedirect("/error/0.4.3/missing/", redirects, locales)).toBeUndefined();
    expect(findVersionRedirect("/error/guides/", redirects, locales)).toBeUndefined();
    expect(findVersionRedirect("/fr/error/0.4.2/", redirects, locales)).toBeUndefined();
    expect(findVersionRedirect("/toString/constructor/", redirects, locales)).toBeUndefined();
    expect(findVersionRedirect("/", redirects, locales)).toBeUndefined();
  });
});
