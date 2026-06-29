import { describe, expect, it } from "vitest";

import { css, html, unsafeHTML, TemplateResult } from "./html.js";

const render = (res: TemplateResult) => res.value.trim();

describe("html", () => {
  it("shouldReturnTemplateResult", () => {
    const res = html`
      <p>hello</p>
    `;
    expect(res).toBeInstanceOf(TemplateResult);
    expect(res.toString().trim()).toBe("<p>hello</p>");
  });

  it("shouldContainPlainTagWithNoInterpolations", () => {
    expect(
      render(html`
        <p>hello</p>
      `),
    ).toBe("<p>hello</p>");
  });

  it("shouldInterpolateStringValuesAndEscapeThem", () => {
    const name = "world";
    expect(
      render(html`
        <p>${name}</p>
      `),
    ).toBe("<p>world</p>");

    const unsafe = "<script>alert(1)</script>";
    expect(
      render(html`
        <p>${unsafe}</p>
      `),
    ).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("shouldInterpolateNumberValues", () => {
    expect(
      render(html`
        <span>${42}</span>
      `),
    ).toBe("<span>42</span>");
  });

  it("shouldSerializeObjectsAsJsonAndEscapeThem", () => {
    const obj = { a: 1 };
    expect(
      render(html`
        <p>${obj}</p>
      `),
    ).toBe("<p>{&quot;a&quot;:1}</p>");
  });

  it("shouldProduceEmptyStringForNullInterpolation", () => {
    expect(
      render(html`
        <p>${null}</p>
      `),
    ).toBe("<p></p>");
  });

  it("shouldProduceEmptyStringForUndefinedInterpolation", () => {
    expect(
      render(html`
        <p>${undefined}</p>
      `),
    ).toBe("<p></p>");
  });

  it("shouldInterpolateBooleanValues", () => {
    expect(
      render(html`
        <p>${true}</p>
      `),
    ).toBe("<p>true</p>");
  });

  it("shouldInterpolateArrayValuesByJoiningAndEscapingThem", () => {
    const items = ["a", null, "b", undefined, "c"];
    expect(
      render(html`
        <ul>
          ${items}
        </ul>
      `).replace(/\s+/g, ""),
    ).toBe("<ul>abc</ul>");

    const unsafeItems = ["<script>", "safe"];
    expect(
      render(html`
        <div>${unsafeItems}</div>
      `),
    ).toBe("<div>&lt;script&gt;safe</div>");
  });

  it("shouldSerializeObjectsWithinArraysAsJsonOrCustomToStringAndEscape", () => {
    class CustomItem {
      toString() {
        return "custom";
      }
    }
    const items = [{ x: 1 }, new CustomItem()];
    expect(
      render(html`
        <div>${items}</div>
      `),
    ).toBe("<div>{&quot;x&quot;:1}custom</div>");
  });

  it("shouldInterpolateArrayOfTemplatesWithoutEscapingThem", () => {
    const items = [
      html`
        <li>a</li>
      `,
      null,
      html`
        <li>b</li>
      `,
      undefined,
    ];
    expect(
      render(html`
        <ul>
          ${items}
        </ul>
      `).replace(/\s+/g, ""),
    ).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("shouldCallCustomToStringOnClassInstanceAndEscape", () => {
    class CustomClass {
      toString() {
        return "<custom>";
      }
    }
    expect(
      render(html`
        <div>${new CustomClass()}</div>
      `),
    ).toBe("<div>&lt;custom&gt;</div>");
  });

  it("shouldFallbackToJsonStringifyWhenPlainObject", () => {
    const plainObj = { x: 1 };
    expect(
      render(html`
        <div>${plainObj}</div>
      `),
    ).toBe("<div>{&quot;x&quot;:1}</div>");
  });

  it("shouldFallbackToJsonStringifyWhenObjectHasNoPrototype", () => {
    const noProtoObj = Object.create(null);
    noProtoObj.y = 2;
    expect(
      render(html`
        <div>${noProtoObj}</div>
      `),
    ).toBe("<div>{&quot;y&quot;:2}</div>");
  });

  it("shouldSupportUnsafeHTMLBypassingEscaping", () => {
    const trusted = "<span>safe</span>";
    expect(
      render(html`
        <div>${unsafeHTML(trusted)}</div>
      `),
    ).toBe("<div><span>safe</span></div>");

    const trustedEmpty = unsafeHTML(null);
    expect(
      render(html`
        <div>${trustedEmpty}</div>
      `),
    ).toBe("<div></div>");
  });
});

describe("css", () => {
  it("shouldReturnCssWithDeclaredProperty", () => {
    const result = css`
      .card {
        color: red;
      }
    `;
    expect(result).toContain("color: red");
    expect(result).toContain(".card");
  });

  it("shouldInterpolateDynamicValues", () => {
    const color = "blue";
    const result = css`
      .card {
        color: ${color};
      }
    `;
    expect(result).toContain("color: blue");
  });

  it("shouldProduceEmptyStringForUndefinedInterpolation", () => {
    const result = css`
      .card {
        color: ${undefined};
      }
    `;
    expect(result).toContain("color: ;");
  });

  it("shouldThrowTypeErrorForPlainObjectInterpolation", () => {
    expect(() => {
      void css`
        .card {
          content: ${{ a: 1 }};
        }
      `;
    }).toThrow("Invalid CSS interpolation: plain objects are not allowed in css helper.");
  });

  it("shouldThrowTypeErrorForArrayInterpolation", () => {
    expect(() => {
      void css`
        .card {
          content: ${[1, 2]};
        }
      `;
    }).toThrow("Invalid CSS interpolation: arrays are not allowed in css helper.");
  });

  it("shouldAllowObjectsWithCustomToString", () => {
    class CustomTheme {
      toString() {
        return "blue";
      }
    }
    const result = css`
      .card {
        color: ${new CustomTheme()};
      }
    `;
    expect(result).toContain("color: blue");
  });
});
