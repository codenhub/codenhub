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

  it("shouldInterpolateArrayValuesByJoiningThem", () => {
    const items = ["a", null, "b", undefined, "c"];
    expect(
      html`
        <ul>
          ${items}
        </ul>
      `
        .trim()
        .replace(/\s+/g, ""),
    ).toBe("<ul>abc</ul>");
  });

  it("shouldSerializeObjectsWithinArraysAsJsonOrCustomToString", () => {
    class CustomItem {
      toString() {
        return "custom";
      }
    }
    const items = [{ x: 1 }, new CustomItem()];
    expect(
      html`
        <div>${items}</div>
      `.trim(),
    ).toBe('<div>{"x":1}custom</div>');
  });

  it("shouldInterpolateArrayOfTemplates", () => {
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
      html`
        <ul>
          ${items}
        </ul>
      `
        .trim()
        .replace(/\s+/g, ""),
    ).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("shouldCallCustomToStringOnClassInstance", () => {
    class CustomClass {
      toString() {
        return "custom-string";
      }
    }
    expect(
      html`
        <div>${new CustomClass()}</div>
      `.trim(),
    ).toBe("<div>custom-string</div>");
  });

  it("shouldFallbackToJsonStringifyWhenPlainObject", () => {
    const plainObj = { x: 1 };
    expect(
      html`
        <div>${plainObj}</div>
      `.trim(),
    ).toBe('<div>{"x":1}</div>');
  });

  it("shouldFallbackToJsonStringifyWhenObjectHasNoPrototype", () => {
    const noProtoObj = Object.create(null);
    noProtoObj.y = 2;
    expect(
      html`
        <div>${noProtoObj}</div>
      `.trim(),
    ).toBe('<div>{"y":2}</div>');
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
