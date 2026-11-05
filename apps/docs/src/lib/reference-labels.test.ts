import { REFERENCE_LABELS } from "@codenhub/tools/documentation";
import { describe, expect, it } from "vitest";

import { messagesFor } from "../i18n";
import { localizeReferenceHeadings, localizeReferenceHtml } from "./reference-labels";

const { labels } = messagesFor("pt-BR").reference;

describe("localizeReferenceHtml", () => {
  it("translates group headings and keeps their ids", () => {
    const html = '<h2 id="functions">Functions<a class="heading-anchor" href="#functions"></a></h2>';

    expect(localizeReferenceHtml(html, labels)).toBe(
      '<h2 id="functions">Funções<a class="heading-anchor" href="#functions"></a></h2>',
    );
  });

  it("translates the labels and sentences the generator writes", () => {
    const html =
      "<p><strong>Returns</strong> — The value.</p><p><strong>Type parameters</strong></p>" +
      '<p>Inherited from <a href="#base">Base</a>.</p><p>Also exported as <code>default</code>.</p>' +
      "<p>Not exported; declared in <code>src/a.ts</code>.</p><blockquote>\n<p><strong>Deprecated.</strong> Use x.</p>";

    expect(localizeReferenceHtml(html, labels)).toBe(
      "<p><strong>Retorna</strong> — The value.</p><p><strong>Parâmetros de tipo</strong></p>" +
        '<p>Herdado de <a href="#base">Base</a>.</p><p>Também exportado como <code>default</code>.</p>' +
        "<p>Não exportado; declarado em <code>src/a.ts</code>.</p><blockquote>\n<p><strong>Obsoleto.</strong> Use x.</p>",
    );
  });

  it("leaves the same words alone where the generator did not write them", () => {
    const html =
      '<h3 id="functions-1">Functions</h3><p>Returns <strong>Returns</strong> the value.</p><h2 id="x">Functions and more</h2>';

    expect(localizeReferenceHtml(html, labels)).toBe(html);
  });

  it("is the identity in English", () => {
    const html = '<h2 id="classes">Classes</h2><p><strong>Example</strong></p>';

    expect(localizeReferenceHtml(html, REFERENCE_LABELS)).toBe(html);
  });
});

describe("localizeReferenceHeadings", () => {
  it("translates only group H2s in the outline", () => {
    const headings = [
      { depth: 1, slug: "pkg", text: "@codenhub/pkg" },
      { depth: 2, slug: "interfaces", text: "Interfaces" },
      { depth: 2, slug: "internal-types", text: "Internal types" },
      { depth: 3, slug: "variables", text: "Variables" },
    ];

    expect(localizeReferenceHeadings(headings, messagesFor("es").reference.labels).map(({ text }) => text)).toEqual([
      "@codenhub/pkg",
      "Interfaces",
      "Tipos internos",
      "Variables",
    ]);
  });
});
