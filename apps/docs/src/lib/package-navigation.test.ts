import { describe, expect, it } from "vitest";

import type { PublicDocument } from "./catalog";
import { buildNavigationTree, groupContainsRoute, type NavGroup } from "./package-navigation";

function doc(
  relativePath: string,
  title: string,
  route: string,
  extra: { group?: string; order?: number } = {},
): PublicDocument {
  return {
    headings: [],
    html: "",
    relativePath,
    route,
    routePath: relativePath.replace(/\.md$/, ""),
    title,
    ...extra,
  };
}

const documents: PublicDocument[] = [
  doc("index.md", "Overview", "/styles/"),
  doc("concepts.md", "Concepts", "/styles/concepts/"),
  doc("integrating/astro.md", "Astro", "/styles/integrating/astro/"),
  doc("integrating/index.md", "Framework integration", "/styles/integrating/", { group: "Integrating" }),
  doc("usage/buttons.md", "Buttons", "/styles/usage/buttons/"),
  doc("usage/index.md", "Usage", "/styles/usage/"),
];

describe("buildNavigationTree", () => {
  it("lists root pages before folder groups when nothing sets an order", () => {
    const tree = buildNavigationTree(documents);

    expect(tree.map((node) => node.kind)).toEqual(["link", "link", "group", "group"]);
    expect(tree.slice(0, 2).map((node) => node.title)).toEqual(["Overview", "Concepts"]);
  });

  it("orders groups by folder name and labels them from the index page's group field", () => {
    const [, , first, second] = buildNavigationTree(documents);

    expect(first).toMatchObject({ kind: "group", title: "Integrating" });
    expect(second).toMatchObject({ kind: "group", title: "Usage" });
  });

  it("keeps the folder index's own title on its page link, distinct from the group label", () => {
    const [, , integrating] = buildNavigationTree(documents) as NavGroup[];

    expect(integrating.title).toBe("Integrating");
    expect(integrating.items[0]).toEqual({
      kind: "link",
      route: "/styles/integrating/",
      title: "Framework integration",
    });
  });

  it("places the folder index first inside its group, under its own title", () => {
    const usage = buildNavigationTree(documents).find(
      (node): node is NavGroup => node.kind === "group" && node.title === "Usage",
    );

    expect(usage?.items.map((item) => item.title)).toEqual(["Usage", "Buttons"]);
  });

  it("falls back to a title-cased folder name when the index sets no group", () => {
    const groups = buildNavigationTree(documents).filter((node): node is NavGroup => node.kind === "group");

    // `usage/index.md` sets no `group`, so its folder name labels the section.
    expect(groups.map((group) => group.title)).toContain("Usage");
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

  it("orders a folder's non-index pages by frontmatter order, then path", () => {
    const tree = buildNavigationTree([
      doc("index.md", "Overview", "/p/"),
      doc("guide/index.md", "Guide", "/p/guide/"),
      doc("guide/alpha.md", "Alpha", "/p/guide/alpha/"),
      doc("guide/zeta.md", "Zeta", "/p/guide/zeta/", { order: 1 }),
      doc("guide/mid.md", "Mid", "/p/guide/mid/", { order: 2 }),
    ]);
    const group = tree.find((node): node is NavGroup => node.kind === "group");

    expect(group?.items.map((item) => item.title)).toEqual(["Guide", "Zeta", "Mid", "Alpha"]);
  });

  it("orders root pages by frontmatter order ahead of the unordered rest", () => {
    const tree = buildNavigationTree([
      doc("index.md", "Overview", "/p/"),
      doc("aaa.md", "Aaa", "/p/aaa/"),
      doc("zzz.md", "Zzz", "/p/zzz/", { order: 1 }),
    ]);

    expect(tree.map((node) => node.title)).toEqual(["Overview", "Zzz", "Aaa"]);
  });

  it("positions a group by its index order, lifting it above unordered root pages", () => {
    const tree = buildNavigationTree([
      doc("index.md", "Overview", "/p/"),
      doc("concepts.md", "Concepts", "/p/concepts/"),
      doc("guide/index.md", "Guide", "/p/guide/", { order: 1 }),
      doc("guide/a.md", "A", "/p/guide/a/"),
    ]);

    expect(tree.map((node) => node.title)).toEqual(["Overview", "Guide", "Concepts"]);
  });

  it("keeps unordered page links before unordered groups", () => {
    const tree = buildNavigationTree([
      doc("index.md", "Overview", "/p/"),
      doc("guide/index.md", "Guide", "/p/guide/"),
      doc("guide/a.md", "A", "/p/guide/a/"),
      doc("reference.md", "Reference", "/p/reference/"),
    ]);

    expect(tree.map((node) => ({ kind: node.kind, title: node.title }))).toEqual([
      { kind: "link", title: "Overview" },
      { kind: "link", title: "Reference" },
      { kind: "group", title: "Guide" },
    ]);
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
