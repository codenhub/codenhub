// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { initPackageGrid } from "./package-grid.ts";

function renderGrid(): void {
  document.body.innerHTML = `
    <input id="package-search" />
    <button id="package-sort" data-sort-direction="asc">
      <i data-sort-icon="asc"></i>
      <i data-sort-icon="desc" hidden></i>
      <span data-sort-label>A–Z</span>
    </button>
    <div id="package-grid">
      <a data-label="Router" data-search="router browser router"></a>
      <a data-label="Error" data-search="error typed error normalization"></a>
      <a data-label="Icons" data-search="icons icon registry"></a>
    </div>
    <p data-empty-filtered hidden></p>
  `;
}

describe("initPackageGrid", () => {
  beforeEach(() => {
    renderGrid();
    initPackageGrid();
  });

  it("hides cards whose search haystack does not match the query", () => {
    const input = document.getElementById("package-search") as HTMLInputElement;
    input.value = "typed";
    input.dispatchEvent(new Event("input"));

    const cards = document.querySelectorAll<HTMLElement>("#package-grid > *");
    expect([...cards].map((card) => card.hidden)).toEqual([true, false, true]);
  });

  it("shows the empty message once every card is filtered out", () => {
    const input = document.getElementById("package-search") as HTMLInputElement;
    const emptyMessage = document.querySelector<HTMLElement>("[data-empty-filtered]");

    input.value = "does-not-match-anything";
    input.dispatchEvent(new Event("input"));

    expect(emptyMessage?.hidden).toBe(false);
  });

  it("clearing the query shows every card again", () => {
    const input = document.getElementById("package-search") as HTMLInputElement;

    input.value = "router";
    input.dispatchEvent(new Event("input"));
    input.value = "";
    input.dispatchEvent(new Event("input"));

    const cards = document.querySelectorAll<HTMLElement>("#package-grid > *");
    expect([...cards].every((card) => !card.hidden)).toBe(true);
  });

  it("sorts cards by label ascending by default", () => {
    const grid = document.getElementById("package-grid");
    const button = document.getElementById("package-sort") as HTMLButtonElement;

    button.click();
    button.click(); // toggling twice returns to the initial ascending order, re-applied

    const labels = [...(grid?.children ?? [])].map((child) => (child as HTMLElement).dataset.label);
    expect(labels).toEqual(["Error", "Icons", "Router"]);
  });

  it("reverses order and flips the button state on click", () => {
    const grid = document.getElementById("package-grid");
    const button = document.getElementById("package-sort") as HTMLButtonElement;

    button.click();

    expect(button.dataset.sortDirection).toBe("desc");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.querySelector("[data-sort-label]")?.textContent).toBe("Z–A");

    const labels = [...(grid?.children ?? [])].map((child) => (child as HTMLElement).dataset.label);
    expect(labels).toEqual(["Router", "Icons", "Error"]);
  });
});
