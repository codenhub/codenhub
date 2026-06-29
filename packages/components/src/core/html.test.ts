import { describe, expect, it } from "vitest";

import { css, html } from "./html.js";

describe("html", () => {
  it("shouldContainPlainTagWithNoInterpolations", () => {
    expect(
      html`
        <p>hello</p>
      `.trim(),
    ).toBe("<p>hello</p>");
  });

  it("shouldInterpolateStringValues", () => {
    const name = "world";
    expect(
      html`
        <p>${name}</p>
      `.trim(),
    ).toBe("<p>world</p>");
  });

  it("shouldInterpolateNumberValues", () => {
    expect(
      html`
        <span>${42}</span>
      `.trim(),
    ).toBe("<span>42</span>");
  });

  it("shouldSerializeObjectsAsJson", () => {
    const obj = { a: 1 };
    expect(
      html`
        <p>${obj}</p>
      `.trim(),
    ).toBe('<p>{"a":1}</p>');
  });

  it("shouldProduceEmptyStringForNullInterpolation", () => {
    expect(
      html`
        <p>${null}</p>
      `.trim(),
    ).toBe("<p></p>");
  });

  it("shouldProduceEmptyStringForUndefinedInterpolation", () => {
    expect(
      html`
        <p>${undefined}</p>
      `.trim(),
    ).toBe("<p></p>");
  });

  it("shouldInterpolateBooleanValues", () => {
    expect(
      html`
        <p>${true}</p>
      `.trim(),
    ).toBe("<p>true</p>");
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
});
