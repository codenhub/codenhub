import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";

/* The promises docs/internal/structure.md makes, one test each, on a blank page
   built from the files a consumer links -- the way the layer suite reads them,
   because the playground compiles everything through Tailwind again. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const built = (file: string) => readFile(path.join(packageRoot, "dist", file), "utf8");

const load = async (page: Page, markup: string, consumerCss = "") => {
  await page.setContent(`<!doctype html><html><body>${markup}</body></html>`);
  await page.addStyleTag({ content: await built("index.css") });
  await page.addStyleTag({ content: await built("aesthetics/index.css") });
  if (consumerCss) {
    await page.addStyleTag({ content: consumerCss });
  }
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
};

const read = (page: Page, testId: string, property: string) =>
  page
    .getByTestId(testId)
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property);

const corners = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((element) => {
    const styles = getComputedStyle(element);
    return [
      styles.borderTopLeftRadius,
      styles.borderTopRightRadius,
      styles.borderBottomRightRadius,
      styles.borderBottomLeftRadius,
    ];
  });

test.describe("corner scale", () => {
  test("scales the corner with the size step, and the tighter step wins", async ({ page }) => {
    await load(
      page,
      `<button data-testid="plain" class="btn">b</button>
       <button data-testid="small" class="btn sm">b</button>
       <button data-testid="large" class="btn lg">b</button>
       <button data-testid="large-tight" class="btn lg p-xs">b</button>
       <div class="card p-xs"><button data-testid="in-tight-card" class="btn">b</button></div>`,
    );

    // `--radius-control` is 0.5rem.
    expect(await read(page, "plain", "border-top-left-radius")).toBe("8px");
    expect(await read(page, "small", "border-top-left-radius")).toBe("6px");
    expect(await read(page, "large", "border-top-left-radius")).toBe("10px");
    expect(await read(page, "large-tight", "border-top-left-radius"), "`.lg.p-xs` takes `.p-xs`").toBe("4px");
    expect(await read(page, "in-tight-card", "border-top-left-radius"), "a card's step does not inherit").toBe("8px");
  });

  test("an explicit --ui-radius still wins, unscaled", async ({ page }) => {
    await load(
      page,
      `<button data-testid="radius" class="btn sm c-radius">b</button>`,
      ".c-radius { --ui-radius: 3px; }",
    );

    expect(await read(page, "radius", "border-top-left-radius")).toBe("3px");
  });

  test("scales an aesthetic's corner and depth down with the step", async ({ page }) => {
    await load(
      page,
      `<div class="chunky-tile">
         <button data-testid="tile" class="btn">b</button>
         <button data-testid="tile-tight" class="btn icon p-xs">b</button>
         <button data-testid="tile-large" class="btn lg">b</button>
       </div>`,
    );

    expect(await read(page, "tile", "border-top-left-radius")).toBe("12px");
    expect(await read(page, "tile-tight", "border-top-left-radius")).toBe("6px");
    expect(await read(page, "tile", "box-shadow"), "the full bar").toContain("0px 4px 0px 0px");
    expect(await read(page, "tile-tight", "box-shadow"), "half the bar").toContain("0px 2px 0px 0px");
    expect(await read(page, "tile-large", "box-shadow"), "depth does not grow past the aesthetic's").toContain(
      "0px 4px 0px 0px",
    );
  });
});

test.describe("corner pattern", () => {
  test(".cut-diagonal rounds two corners and leaves two square", async ({ page }) => {
    await load(
      page,
      `<button data-testid="diagonal" class="btn cut-diagonal">b</button>
       <div data-testid="reverse" class="card cut-diagonal-reverse">c</div>`,
    );

    expect(await corners(page, "diagonal")).toEqual(["8px", "0px", "8px", "0px"]);
    expect(await corners(page, "reverse")).toEqual(["0px", "14px", "0px", "14px"]);
  });

  test("cyber cuts controls and surfaces on opposite diagonals", async ({ page }) => {
    await load(
      page,
      `<div class="cyber">
         <button data-testid="control" class="btn">b</button>
         <button data-testid="small-control" class="btn p-xs">b</button>
         <div data-testid="surface" class="card">c</div>
       </div>`,
    );

    const supportsBevel = await page.evaluate(() => CSS.supports("corner-shape", "bevel"));
    test.skip(!supportsBevel, "an engine without `corner-shape` squares cyber's corners");

    expect(await corners(page, "control")).toEqual(["10px", "0px", "10px", "0px"]);
    expect(await corners(page, "small-control"), "half the cut at `.p-xs`").toEqual(["5px", "0px", "5px", "0px"]);
    expect(await corners(page, "surface")).toEqual(["0px", "10px", "0px", "10px"]);
  });
});
