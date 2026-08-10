import { describe, expect, it } from "vitest";

import { searchDocumentation, type SearchEntry } from "./search";

const entries: SearchEntry[] = [
  {
    packageLabel: "Styles",
    route: "/styles/tokens/",
    text: "Tokens are CSS custom properties.",
    title: "Tokens",
  },
  {
    packageLabel: "Styles",
    route: "/styles/tokens/#presentation-tokens",
    section: "Presentation Tokens",
    text: "Presentation tokens describe how much of an intent a component shows.",
    title: "Tokens",
  },
  {
    packageLabel: "Error",
    route: "/error/",
    text: "Normalize application errors into a typed result.",
    title: "Overview",
  },
  {
    packageLabel: "Router",
    route: "/router/reference/",
    text: "Match a route pattern and render the view behind it.",
    title: "Reference",
  },
  {
    packageLabel: "Router",
    route: "/router/reference/#navigation",
    section: "Navigation",
    text: "Guard a transition before the browser history entry changes.",
    title: "Reference",
  },
  {
    packageLabel: "I18n",
    route: "/i18n/examples/#routed-hydration",
    section: "Routed Hydration",
    text: "Hydrate a locale from the matched path segment.",
    title: "Examples",
  },
];

const routesFor = (query: string) => searchDocumentation(entries, query).map((result) => result.entry.route);

describe("searchDocumentation", () => {
  it("returns nothing for a blank query", () => {
    expect(searchDocumentation(entries, "   ")).toEqual([]);
  });

  it("ranks the section that names the query above the page holding it", () => {
    expect(routesFor("presentation")[0]).toBe("/styles/tokens/#presentation-tokens");
  });

  it("puts a package's own document first when the query names the package", () => {
    // "Routed Hydration" fuzzily out-scores the bare label match, so the
    // exact-name bonus is what keeps "router" from landing in another package.
    expect(routesFor("router")[0]).toBe("/router/reference/");
  });

  it("does not lift a section through the package it belongs to", () => {
    // "Navigation" sits in Router but says nothing about it, so the package name
    // only reaches the document entry rather than every heading underneath it.
    expect(routesFor("router")).not.toContain("/router/reference/#navigation");
  });

  it("finds an entry through a literal phrase in its prose", () => {
    expect(routesFor("browser history")).toEqual(["/router/reference/#navigation"]);
  });

  it("drops a label the query only reaches by skipping most of it", () => {
    // "soft" is a subsequence of "Supported Format" that lands on word starts,
    // which is enough to rank it above the real answer without a floor.
    const scattered: SearchEntry[] = [
      { packageLabel: "Skills", route: "/skills/", section: "Supported Format", text: "Frontmatter.", title: "Skills" },
    ];

    expect(searchDocumentation(scattered, "soft")).toEqual([]);
  });

  it("does not match prose through a scattered subsequence", () => {
    // Every one of these letters appears in order somewhere in the Error prose,
    // which is exactly what a fuzzy match over a paragraph would wrongly accept.
    expect(routesFor("nlzapperr")).toEqual([]);
  });

  it("reports the positions matched in the label it displays", () => {
    const [result] = searchDocumentation(entries, "presentation");

    expect(result?.entry.section).toBe("Presentation Tokens");
    expect(result?.positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("caps the result count", () => {
    expect(searchDocumentation(entries, "e", { limit: 2 })).toHaveLength(2);
  });
});
