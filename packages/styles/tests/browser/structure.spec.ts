import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";
import { expectSameColor, getColorDistance } from "./test-utils";

/* The promises docs/internal/model.md#material-tokens makes, one test each, on a blank page
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

test("a press travels exactly the depth it lands on", async ({ page }) => {
  await load(
    page,
    `<div class="chunky-tile" style="padding: 2rem">
       <button data-testid="tile-tight" class="btn p-xs">b</button>
     </div>`,
  );

  const button = page.getByTestId("tile-tight");

  await button.hover();
  await page.mouse.down();
  try {
    await expect
      .poll(() => button.evaluate((node) => getComputedStyle(node).translate), "half the lift, like the bar")
      .toBe("0px 2px");
  } finally {
    await page.mouse.up();
  }
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

test.describe("line style", () => {
  test("reaches every line a component draws", async ({ page }) => {
    await load(
      page,
      `<div class="c-dashed">
         <button data-testid="button" class="btn edged">b</button>
         <input data-testid="field" class="ipt" />
         <div data-testid="card" class="card">c</div>
         <div data-testid="progress" class="progress"></div>
         <table class="data-table"><thead><tr><th data-testid="head">h</th></tr></thead></table>
       </div>`,
      ".c-dashed { --ui-line-style: dashed; }",
    );

    const styles = await Promise.all(
      ["button", "field", "card", "progress"].map(async (testId) => [
        testId,
        await read(page, testId, "border-top-style"),
      ]),
    );

    expect(Object.fromEntries(styles)).toEqual({
      button: "dashed",
      card: "dashed",
      field: "dashed",
      progress: "dashed",
    });
    expect(await read(page, "head", "border-bottom-style"), "the table's head rule").toBe("dashed");
  });

  test("draws solid by default", async ({ page }) => {
    await load(page, `<input data-testid="field" class="ipt" />`);

    expect(await read(page, "field", "border-top-style")).toBe("solid");
  });
});

test.describe("shadow layers", () => {
  test(".flat keeps the halo, and a field takes it", async ({ page }) => {
    await load(
      page,
      `<div class="cyber">
         <button data-testid="flat" class="btn flat success">b</button>
         <input data-testid="field" class="ipt" />
       </div>`,
    );

    expect(await read(page, "flat", "box-shadow")).toMatch(/0px 0px 8px 0px/);
    expect(await read(page, "field", "box-shadow")).toMatch(/0px 0px 8px 0px/);
  });
});

test.describe("painted layer", () => {
  test("paints surfaces and not controls, and a consumer's background-image wins", async ({ page }) => {
    const stripes = "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))";

    await load(
      page,
      `<div class="c-image">
         <div data-testid="card" class="card">c</div>
         <div data-testid="own" class="card c-own">c</div>
         <button data-testid="button" class="btn">b</button>
       </div>`,
      `.c-image { --ui-surface-image: ${stripes}; } .c-own { background-image: none; }`,
    );

    expect(await read(page, "card", "background-image")).toBe(stripes);
    expect(await read(page, "own", "background-image"), "the consumer's own rule").toBe("none");
    expect(await read(page, "button", "background-image"), "controls take no painted layer").toBe("none");
  });
});

test.describe("label treatment", () => {
  test("reaches buttons and badges, and a consumer's utility beats it", async ({ page }) => {
    await load(
      page,
      `<div class="c-label">
         <button data-testid="button" class="btn">b</button>
         <span data-testid="badge" class="badge">b</span>
         <button data-testid="own" class="btn c-own">b</button>
       </div>`,
      `.c-label { --ui-label-weight: 300; --ui-label-case: uppercase; --ui-label-shadow: 0 0 4px; }
       @layer utilities { .c-own { font-weight: 900; text-transform: lowercase; } }`,
    );

    expect(await read(page, "button", "font-weight")).toBe("300");
    expect(await read(page, "badge", "font-weight")).toBe("300");
    expect(await read(page, "button", "text-transform")).toBe("uppercase");
    expect(await read(page, "badge", "text-transform")).toBe("uppercase");
    expect(await read(page, "button", "text-shadow"), "the shadow takes the label's colour").toBe(
      `${await read(page, "button", "color")} 0px 0px 4px`,
    );
    expect(await read(page, "own", "font-weight"), "a consumer's weight utility").toBe("900");
    expect(await read(page, "own", "text-transform"), "a consumer's case utility").toBe("lowercase");
  });
});

/* Every structural part draws its plain version under forced colours. */
test.describe("forced colours", () => {
  test("resets every structural part", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await load(
      page,
      `<div class="cyber c-parts">
         <button data-testid="button" class="btn edged">b</button>
         <div data-testid="card" class="card">c</div>
       </div>`,
      `.c-parts { --ui-line-style: dashed; --ui-surface-image: linear-gradient(red, blue);
         --ui-label-shadow: 0 0 4px; }`,
    );

    expect(await read(page, "button", "--ui-line-style")).toBe("solid");
    expect(await read(page, "button", "border-top-style")).toBe("solid");
    expect(await read(page, "button", "--ui-halo-ink"), "cyber's halo").toBe("");
    expect(await read(page, "card", "--ui-surface-image")).toBe("none");
    expect(await read(page, "button", "--ui-label-shadow")).toBe("none");
  });

  /* An edge drawn as an inset ring is a box shadow, and forced colours remove
     every one. With the border ceiling at zero beside it, every box of the
     aesthetic lost its boundary. */
  test("draws a real border where an aesthetic's edge is a shadow", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await load(
      page,
      `<div class="pixel">
         <button data-testid="button" class="btn">b</button>
         <input data-testid="field" class="ipt" />
         <div data-testid="card" class="card">c</div>
         <input data-testid="switch" type="checkbox" class="switch" />
       </div>`,
    );

    for (const testId of ["button", "field", "card"]) {
      // oxlint-disable-next-line no-await-in-loop -- three reads of one page.
      expect(await read(page, testId, "border-top-width"), `${testId} border`).toBe("2px");
      // oxlint-disable-next-line no-await-in-loop -- three reads of one page.
      expect(await read(page, testId, "clip-path"), `${testId} clip`).toBe("none");
    }
    expect(await read(page, "switch", "--ui-shadow-edge"), "the knob sizes from the border again").toBe("");
  });
});

/* An aesthetic that clips draws focus as an inset layer, in the primary
   colour. On a box filled with that colour the layer was invisible, so a line
   of the page colour sits inside it. */
test.describe("inset focus", () => {
  test("shows on a box filled with the ring's own colour", async ({ page }) => {
    await load(page, `<div class="pixel light"><button data-testid="button" class="btn primary">b</button></div>`);

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("button")).toBeFocused();
    /* The layers are transitioned in, so this waits for the settled value. */
    await expect
      .poll(() => page.getByTestId("button").evaluate((element) => getComputedStyle(element).boxShadow))
      .toMatch(/\b0px 0px 0px 9px\b/);

    const layers = await page.getByTestId("button").evaluate((element) => {
      const styles = getComputedStyle(element);
      const probe = document.createElement("span");

      /* Inside the button, so the page colour resolves in the button's own
         theme scope rather than the document's. */
      element.append(probe);

      /* Each colour resolved by the engine, so a ring and a plate are compared
         as colours rather than as two spellings of one. */
      const resolve = (color: string) => {
        probe.style.color = color;

        return getComputedStyle(probe).color;
      };
      const result = {
        focusVisible: element.matches(":focus-visible"),
        shadow: styles.boxShadow,
        plate: resolve(styles.backgroundColor),
        page: resolve("var(--color-background)"),
      };

      probe.remove();

      return result;
    });

    expect(layers.focusVisible).toBe(true);
    expect(layers.shadow.match(/inset/g), layers.shadow).toHaveLength(3);
    expect(layers.shadow, "the line sits two pixels inside the ring").toMatch(/\b0px 0px 0px 9px\b/);

    const line = layers.shadow.match(/[a-z]+\([^)]*\)/g)!.at(-1)!;

    expectSameColor(line, layers.page, "the innermost layer is the page colour");
    expect(getColorDistance(line, layers.plate), "which is not the plate's").toBeGreaterThan(20);
  });
});
