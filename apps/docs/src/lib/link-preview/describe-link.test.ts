import { describe, expect, it } from "vitest";

import { describeLink } from "./describe-link";

const pageUrl = "https://docs.example.dev/kit/setup/";
const previews = {
  "/kit/concepts/": { summary: "What the kit is made of.", title: "Concepts", trail: ["Kit", "Guides"] },
  "/kit/concepts/#tokens": { summary: "Named values.", title: "Tokens", trail: ["Kit", "Concepts"] },
  "/kit/setup/#install": { title: "Install", trail: ["Kit", "Setup"] },
};
const context = { pageUrl, previews };

describe("describeLink", () => {
  it("describes a page on this site from the preview index", () => {
    expect(describeLink("../concepts/", context)).toEqual({
      actions: [
        { icon: "ic-lucide-copy", kind: "copy", label: "Copy link", text: "https://docs.example.dev/kit/concepts/" },
        {
          href: "https://docs.example.dev/kit/concepts/",
          icon: "ic-lucide-external-link",
          isNewTab: true,
          kind: "open",
          label: "New tab",
        },
        {
          href: "https://docs.example.dev/kit/concepts/",
          icon: "ic-lucide-arrow-right",
          isNewTab: false,
          kind: "open",
          label: "Open",
        },
      ],
      detail: "/kit/concepts/",
      summary: "What the kit is made of.",
      title: "Concepts",
      trail: ["Kit", "Guides"],
    });
  });

  it("describes a section, on another page or this one", () => {
    expect(describeLink("/kit/concepts/#tokens", context)).toMatchObject({
      detail: "/kit/concepts/#tokens",
      title: "Tokens",
      trail: ["Kit", "Concepts"],
    });
    expect(describeLink("#install", context)).toMatchObject({ title: "Install" });
  });

  it("falls back to the page when the section is unknown", () => {
    expect(describeLink("/kit/concepts/#gone", context)).toMatchObject({ title: "Concepts" });
  });

  it("names a published file by its last path segment", () => {
    expect(describeLink("/kit/LICENSE", context)).toMatchObject({
      detail: "/kit/LICENSE",
      title: "LICENSE",
      trail: ["docs.example.dev"],
    });
  });

  it("describes an external page by its host and full URL", () => {
    expect(describeLink("https://www.npmjs.com/package/kit", context)).toMatchObject({
      detail: "https://www.npmjs.com/package/kit",
      title: "npmjs.com",
      trail: ["External site"],
    });
  });

  it("offers to copy or write to an email address", () => {
    expect(describeLink("mailto:team@example.dev?subject=Hello%20there", context)).toEqual({
      actions: [
        { icon: "ic-lucide-copy", kind: "copy", label: "Copy address", text: "team@example.dev" },
        {
          href: "mailto:team@example.dev?subject=Hello%20there",
          icon: "ic-lucide-mail",
          isNewTab: false,
          kind: "open",
          label: "Send email",
        },
      ],
      summary: "Subject: Hello there",
      title: "team@example.dev",
      trail: ["Email"],
    });
  });

  it("offers to copy or call a phone number", () => {
    expect(describeLink("tel:+5511999990000", context)).toMatchObject({
      actions: [
        { label: "Copy number", text: "+5511999990000" },
        { href: "tel:+5511999990000", label: "Call" },
      ],
      title: "+5511999990000",
      trail: ["Phone"],
    });
  });

  it("gives no preview for other schemes", () => {
    expect(describeLink("javascript:void(0)", context)).toBeUndefined();
    expect(describeLink("ftp://example.dev/file", context)).toBeUndefined();
  });
});
