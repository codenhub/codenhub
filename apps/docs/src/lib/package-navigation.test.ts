import { describe, expect, it } from "vitest";

import type { PublicDocument } from "./catalog";
import { buildNavigationTree, groupContainsRoute, type NavGroup } from "./package-navigation";

function doc(relativePath: string, title: string, route: string): PublicDocument {
  return { headings: [], html: "", relativePath, route, routePath: relativePath.replace(/\.md$/, ""), title };
}

const documents: PublicDocument[] = [
  doc("index.md", "Overview", "/styles/"),
  doc("concepts.md", "Concepts", "/styles/concepts/"),
  doc("integrating/astro.md", "Astro", "/styles/integrating/astro/"),
  doc("integrating/index.md", "Framework integration", "/styles/integrating/"),
  doc("usage/buttons.md", "Buttons", "/styles/usage/buttons/"),
  doc("usage/index.md", "Usage", "/styles/usage/"),
];

describe("buildNavigationTree", () => {
  it("lists root pages before folder groups, keeping their order", () => {
    const tree = buildNavigationTree(documents);

    expect(tree.map((node) => node.kind)).toEqual(["link", "link", "group", "group"]);
    expect(tree.slice(0, 2).map((node) => node.title)).toEqual(["Overview", "Concepts"]);
  });

  it("orders groups by folder name and labels them from the folder's index page", () => {
    const [, , first, second] = buildNavigationTree(documents);

    expect(first).toMatchObject({ kind: "group", title: "Framework integration" });
    expect(second).toMatchObject({ kind: "group", title: "Usage" });
  });

  it("places the folder index first inside its group, under its own title", () => {
    const usage = buildNavigationTree(documents).find(
      (node): node is NavGroup => node.kind === "group" && node.title === "Usage",
    );

    expect(usage?.items.map((item) => item.title)).toEqual(["Usage", "Buttons"]);
  });

  it("falls back to a title-cased folder name when a folder has no index page", () => {
    const tree = buildNavigationTree([doc("recipes/first.md", "First recipe", "/x/recipes/first/")]);

    expect(tree).toEqual([
      { items: [{ kind: "link", route: "/x/recipes/first/", title: "First recipe" }], kind: "group", title: "Recipes" },
    ]);
  });

  it("leaves a folderless package as a flat list", () => {
    const tree = buildNavigationTree([
      doc("index.md", "Overview", "/kbd/"),
      doc("reference.md", "Reference", "/kbd/reference/"),
    ]);

    expect(tree.every((node) => node.kind === "link")).toBe(true);
  });
});

describe("groupContainsRoute", () => {
  const usage = buildNavigationTree(documents).find(
    (node): node is NavGroup => node.kind === "group" && node.title === "Usage",
  )!;

  it("matches a route held by the group", () => {
    expect(groupContainsRoute(usage, "/styles/usage/buttons/")).toBe(true);
  });

  it("rejects a route outside the group or an undefined route", () => {
    expect(groupContainsRoute(usage, "/styles/concepts/")).toBe(false);
    expect(groupContainsRoute(usage, undefined)).toBe(false);
  });
});
