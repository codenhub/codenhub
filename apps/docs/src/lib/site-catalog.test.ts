import { describe, expect, it } from "vitest";

import { buildSiteCatalog, type CatalogPackageSource } from "./site-catalog";

const siteUrl = "https://docs.example.dev";

const page = (relativePath: string, routePath: string, title: string, description?: string) => ({
  description,
  relativePath,
  routePath,
  title,
});

const kit: CatalogPackageSource = {
  description: "A kit.",
  label: "Kit",
  name: "@scope/kit",
  redirects: [{ from: "0.5.0" }, { from: "0.4.0", to: "0.4.1" }, { from: "0.3.0" }],
  slug: "kit",
  status: "active",
  versions: [
    {
      documents: [
        page("index.md", "", "Overview"),
        page("reference/index.md", "reference", "Reference"),
        page("changelog/0.5.0.md", "changelog/0.5.0", "0.5.0", "Adds strict mode."),
      ],
      llmsFiles: ["llms.txt", "llms-full.txt"],
      localeDocuments: {
        es: [
          { lang: "en", relativePath: "index.md" },
          { lang: "en", relativePath: "reference/index.md" },
          { lang: "en", relativePath: "changelog/0.5.0.md" },
        ],
        "pt-BR": [
          { lang: "pt-BR", relativePath: "index.md" },
          { lang: "en", relativePath: "reference/index.md" },
          { lang: "en", relativePath: "changelog/0.5.0.md" },
        ],
      },
      version: "0.5.0",
    },
    {
      archived: true,
      documents: [page("index.md", "", "Overview")],
      llmsFiles: ["llms.txt", "llms-full.txt"],
      localeDocuments: { es: [{ lang: "en", relativePath: "index.md" }], "pt-BR": [] },
      version: "0.4.1",
    },
  ],
};

describe("buildSiteCatalog", () => {
  it("lists each kept version with its pages, translations, and LLM files", () => {
    const catalog = buildSiteCatalog(siteUrl, [kit]);

    expect(catalog.locales).toEqual(["en", "pt-BR", "es"]);
    expect(catalog.packages).toEqual([
      {
        current: "0.5.0",
        description: "A kit.",
        label: "Kit",
        name: "@scope/kit",
        redirects: { "0.3.0": "0.5.0", "0.4.0": "0.4.1" },
        slug: "kit",
        status: "active",
        versions: [
          {
            llms: "https://docs.example.dev/kit/llms.txt",
            llmsFull: "https://docs.example.dev/kit/llms-full.txt",
            pages: [
              {
                markdown: "https://docs.example.dev/kit/index.md",
                path: "",
                section: "guides",
                title: "Overview",
                translations: ["pt-BR"],
                url: "https://docs.example.dev/kit/",
              },
              {
                markdown: "https://docs.example.dev/kit/reference/index.md",
                path: "reference",
                section: "reference",
                title: "Reference",
                translations: [],
                url: "https://docs.example.dev/kit/reference/",
              },
              {
                description: "Adds strict mode.",
                markdown: "https://docs.example.dev/kit/changelog/0.5.0/index.md",
                path: "changelog/0.5.0",
                section: "changelog",
                title: "0.5.0",
                translations: [],
                url: "https://docs.example.dev/kit/changelog/0.5.0/",
              },
            ],
            url: "https://docs.example.dev/kit/",
            version: "0.5.0",
          },
          {
            llms: "https://docs.example.dev/kit/0.4.1/llms.txt",
            llmsFull: "https://docs.example.dev/kit/0.4.1/llms-full.txt",
            pages: [
              {
                markdown: "https://docs.example.dev/kit/0.4.1/index.md",
                path: "",
                section: "guides",
                title: "Overview",
                translations: [],
                url: "https://docs.example.dev/kit/0.4.1/",
              },
            ],
            url: "https://docs.example.dev/kit/0.4.1/",
            version: "0.4.1",
          },
        ],
      },
    ]);
  });

  it("serializes without optional fields a package does not set, or LLM files a version does not publish", () => {
    const catalog = buildSiteCatalog(siteUrl, [
      {
        label: "Store",
        redirects: [],
        slug: "store",
        status: "experimental",
        versions: [
          { documents: [], llmsFiles: ["llms.txt"], localeDocuments: { es: [], "pt-BR": [] }, version: "0.1.0" },
          {
            archived: true,
            documents: [],
            llmsFiles: [],
            localeDocuments: { es: [], "pt-BR": [] },
            version: "0.0.1",
          },
        ],
      },
    ]);

    expect(JSON.parse(JSON.stringify(catalog)).packages[0]).toEqual({
      current: "0.1.0",
      label: "Store",
      redirects: {},
      slug: "store",
      status: "experimental",
      versions: [
        {
          llms: "https://docs.example.dev/store/llms.txt",
          pages: [],
          url: "https://docs.example.dev/store/",
          version: "0.1.0",
        },
        { pages: [], url: "https://docs.example.dev/store/0.0.1/", version: "0.0.1" },
      ],
    });
  });
});
